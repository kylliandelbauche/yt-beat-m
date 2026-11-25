#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod engine;

use std::sync::Mutex;
use tauri::{webview::NewWindowResponse, Manager, WebviewUrl, WebviewWindowBuilder};

fn is_local(url: &tauri::Url, origin: &tauri::Url) -> bool {
    url.origin() == origin.origin() && url.username().is_empty() && url.password().is_none()
}

fn open_external(url: &tauri::Url) {
    // No file:, javascript:, custom protocol or command can reach the OS opener.
    if matches!(url.scheme(), "https" | "http")
        && url.username().is_empty()
        && url.password().is_none()
    {
        let _ = opener::open(url.as_str());
    }
}

fn main() {
    let app = tauri::Builder::default()
        .setup(|app| {
            let filename = if cfg!(windows) {
                "beat-m-engine.exe"
            } else {
                "beat-m-engine"
            };
            #[cfg(debug_assertions)]
            let binary = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("resources/engine")
                .join(filename);
            #[cfg(not(debug_assertions))]
            let binary = app.path().resource_dir()?.join("engine").join(filename);
            match engine::Engine::start(&binary) {
                Ok((engine, origin)) => {
                    app.manage(Mutex::new(Some(engine)));
                    let allowed = origin.clone();
                    WebviewWindowBuilder::new(app, "main", WebviewUrl::External(origin))
                        .title("Beat m — Prototype")
                        .inner_size(1440.0, 900.0)
                        .min_inner_size(760.0, 600.0)
                        .on_navigation(move |url| {
                            if is_local(url, &allowed) {
                                true
                            } else {
                                open_external(url);
                                false
                            }
                        })
                        .on_new_window(|url, _| {
                            open_external(&url);
                            NewWindowResponse::Deny
                        })
                        .on_download(|_, _| false)
                        .build()?;
                }
                Err(_) => {
                    WebviewWindowBuilder::new(app, "error", WebviewUrl::App("index.html".into()))
                        .title("Beat m — Démarrage impossible")
                        .inner_size(520.0, 340.0)
                        .build()?;
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Impossible de démarrer Beat m");
    app.run(|app, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            if let Some(state) = app.try_state::<Mutex<Option<engine::Engine>>>() {
                if let Ok(mut engine) = state.lock() {
                    // Drop also handles failed startup and failed window construction.
                    drop(engine.take());
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_owned_origin_can_navigate() {
        let origin = tauri::Url::parse("http://127.0.0.1:45678/").unwrap();
        for value in [
            "http://127.0.0.1:45678/",
            "http://127.0.0.1:45678/api/beats",
        ] {
            assert!(is_local(&tauri::Url::parse(value).unwrap(), &origin));
        }
        for value in [
            "http://127.0.0.1:8765/",
            "http://localhost:45678/",
            "http://127.0.0.1:45678.evil.test/",
            "https://example.org/",
            "file:///tmp/index.html",
            "http://user@127.0.0.1:45678/",
        ] {
            if let Ok(url) = tauri::Url::parse(value) {
                assert!(!is_local(&url, &origin), "{value}");
            }
        }
    }
}
