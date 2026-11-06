"""Small HTTPS reader for explicitly supported product pages, never a general URL proxy."""

import http.client
import ipaddress
import re
import socket
import ssl
import threading
import time
from urllib.parse import parse_qs, urljoin, urlsplit, urlunsplit

from yt_beat_m.library import LibraryError

BODY_LIMIT = 2 * 1024 * 1024


class MarketplaceError(LibraryError):
    pass


def product_url(value, *, api=False):
    try:
        p = urlsplit(value)
        host = (p.hostname or "").lower()
        if (
            p.scheme != "https"
            or p.username
            or p.password
            or p.port
            or len(value) > 2048
            or "\\" in value
            or any(ch.isspace() or ord(ch) < 32 for ch in value)
        ):
            return None
        valid = (
            (
                host == "main.v2.beatstars.com"
                and p.path == "/track"
                and set(parse_qs(p.query)) == {"id"}
                and len(parse_qs(p.query)["id"]) == 1
                and re.fullmatch(r"[1-9][0-9]{0,11}", parse_qs(p.query)["id"][0])
            )
            if api
            else (
                host in {"jakebmusic.com", "www.jakebmusic.com"}
                and re.fullmatch(r"/produit/[a-z0-9-]{1,200}/?", p.path)
                or host == "bsta.rs"
                and re.fullmatch(r"/[A-Za-z0-9]{4,32}/?", p.path)
                or (
                    host in {"beatstars.com", "www.beatstars.com"}
                    or re.fullmatch(r"[a-z0-9-]{1,63}\.beatstars\.com", host)
                )
                and re.fullmatch(r"/beat/(?:[a-zA-Z0-9-]{1,200}-)?[1-9][0-9]{0,11}/?", p.path)
            )
        )
        if not valid:
            return None
        return urlunsplit(("https", host, p.path, p.query if api else "", ""))
    except (ValueError, TypeError):
        return None


class PublicHTTPS(http.client.HTTPSConnection):
    def connect(self):
        addresses = socket.getaddrinfo(self.host, 443, type=socket.SOCK_STREAM)
        if not addresses or any(
            not ipaddress.ip_address(a[4][0]).is_global
            or ipaddress.ip_address(a[4][0]).is_multicast
            or ipaddress.ip_address(a[4][0]).is_reserved
            for a in addresses
        ):
            raise MarketplaceError("La page de vente pointe vers une adresse réseau refusée.")
        # Connect to the checked numeric address, retaining hostname validation and SNI.
        sock = socket.create_connection((addresses[0][4][0], 443), timeout=self.timeout)
        try:
            self.sock = self._context.wrap_socket(sock, server_hostname=self.host)
        except Exception:
            sock.close()
            raise


def fetch_product(url, *, api=False, stopping=None, deadline=None):
    deadline = deadline or time.monotonic() + 15
    for _ in range(4):
        checked = product_url(url, api=api)
        if not checked:
            raise MarketplaceError(
                "Adresse de page de vente non prise en charge ou redirection refusée."
            )
        remaining = deadline - time.monotonic()
        if remaining <= 0 or stopping is not None and stopping.is_set():
            raise MarketplaceError("Lecture de la page interrompue ou délai dépassé. Réessaie.")
        p = urlsplit(checked)
        connection = PublicHTTPS(
            p.hostname, timeout=min(4, remaining), context=ssl.create_default_context()
        )

        def abort(conn=connection):
            sock = conn.sock
            if sock:
                try:
                    sock.shutdown(socket.SHUT_RDWR)
                except OSError:
                    pass
            conn.close()

        finished = threading.Event()

        def watch(done=finished, close=abort):
            while not done.wait(0.1):
                if time.monotonic() >= deadline or stopping is not None and stopping.is_set():
                    close()
                    return

        watcher = threading.Thread(target=watch, daemon=True, name="shop-read-deadline")
        watcher.start()
        try:
            connection.request(
                "GET",
                p.path + ("?" + p.query if p.query else ""),
                headers={
                    "User-Agent": "Beat-m/0.1",
                    "Accept-Encoding": "identity",
                    "Accept": "application/json" if api else "text/html",
                },
            )
            with connection.getresponse() as response:
                if response.status in {301, 302, 303, 307, 308}:
                    url = urljoin(checked, response.getheader("Location", ""))
                    continue
                if response.status != 200:
                    raise MarketplaceError(
                        "Page de vente indisponible ou accès refusé. Réessaie plus tard."
                    )
                expected = {"application/json"} if api else {"text/html", "application/xhtml+xml"}
                if (
                    response.getheader("Content-Type", "").split(";")[0].strip().lower()
                    not in expected
                ):
                    raise MarketplaceError(
                        "Le format reçu depuis la page de vente n’est pas pris en charge."
                    )
                if response.getheader("Content-Encoding", "identity").lower() not in {
                    "",
                    "identity",
                }:
                    raise MarketplaceError("Réponse compressée non prise en charge.")
                if int(response.getheader("Content-Length", "0")) > BODY_LIMIT:
                    raise MarketplaceError("La page de vente dépasse la taille autorisée.")
                data = bytearray()
                while True:
                    if time.monotonic() >= deadline or stopping is not None and stopping.is_set():
                        raise MarketplaceError(
                            "Lecture de la page interrompue ou délai dépassé. Réessaie."
                        )
                    block = response.read(min(65536, BODY_LIMIT + 1 - len(data)))
                    if not block:
                        return checked, bytes(data)
                    data.extend(block)
                    if len(data) > BODY_LIMIT:
                        raise MarketplaceError("La page de vente dépasse la taille autorisée.")
        except (OSError, http.client.HTTPException, ValueError) as exc:
            raise MarketplaceError(
                "Lecture de la page de vente impossible. Réessaie plus tard."
            ) from exc
        finally:
            finished.set()
            connection.close()
            watcher.join(timeout=0.2)
    raise MarketplaceError("Trop de redirections pour cette page de vente.")
