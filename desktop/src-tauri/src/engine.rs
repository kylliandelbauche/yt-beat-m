use serde::Deserialize;
use std::{
    io::{BufRead, BufReader, Read, Write},
    path::Path,
    process::{Child, Command, Stdio},
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};

#[derive(Deserialize)]
struct Ready {
    port: u16,
}

pub struct Engine(Child);

impl Engine {
    pub fn start(binary: &Path) -> Result<(Self, tauri::Url), &'static str> {
        let mut child = Command::new(binary)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .env_remove("PYTHONHOME")
            .env_remove("PYTHONPATH")
            .spawn()
            .map_err(|_| "Le moteur embarqué est introuvable.")?;
        let stdout = child.stdout.take().ok_or("Canal du moteur indisponible.")?;
        let mut engine = Self(child);
        let preferences = std::env::var_os("BEAT_M_DESKTOP_PREFERENCES")
            .map(|value| {
                value
                    .into_string()
                    .map_err(|_| "Configuration locale invalide.")
            })
            .transpose()?;
        let options = serde_json::json!({"preferences": preferences});
        writeln!(
            engine
                .0
                .stdin
                .as_mut()
                .ok_or("Canal du moteur indisponible.")?,
            "{}",
            options
        )
        .map_err(|_| "Le moteur ne répond pas.")?;
        let (tx, rx) = mpsc::channel();
        thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            let mut line = String::new();
            // Never retain unbounded child output or publish engine diagnostics.
            let ready =
                reader.by_ref().take(4096).read_line(&mut line).is_ok() && line.ends_with('\n');
            let _ = tx.send(if ready { Some(line) } else { None });
            let _ = std::io::copy(&mut reader, &mut std::io::sink());
        });
        let line = rx
            .recv_timeout(Duration::from_secs(30))
            .ok()
            .flatten()
            .ok_or("Le moteur n’a pas démarré à temps.")?;
        let ready: Ready = serde_json::from_str(&line).map_err(|_| "Réponse moteur invalide.")?;
        if ready.port == 0 {
            return Err("Port moteur invalide.");
        }
        let url = format!("http://127.0.0.1:{}/", ready.port)
            .parse()
            .map_err(|_| "Adresse moteur invalide.")?;
        Ok((engine, url))
    }

    pub fn stop(&mut self) {
        drop(self.0.stdin.take());
        // Existing workers each have a bounded 12-second stop. Give all three
        // time to finish before the last-resort kill (never detach a live child).
        let deadline = Instant::now() + Duration::from_secs(45);
        while Instant::now() < deadline {
            match self.0.try_wait() {
                Ok(None) => thread::sleep(Duration::from_millis(40)),
                _ => return,
            }
        }
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

impl Drop for Engine {
    fn drop(&mut self) {
        self.stop();
    }
}
