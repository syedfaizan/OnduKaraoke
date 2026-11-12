import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';

/**
 * LEFT column of the host screen: the join QR code (always visible) with the
 * room code underneath, plus a smaller "host remote" QR that turns a phone
 * into the host controller (skip / reorder / speed).
 *
 * `baseUrl` is the origin phones can reach (the LAN address when the host
 * screen runs on localhost). The room path is appended here so the QR always
 * points at THIS room's join page.
 */
export default function QrPanel({ baseUrl, roomCode, hostToken }) {
  const [guestQr, setGuestQr] = useState('');
  const [hostQr, setHostQr] = useState('');

  const joinUrl = useMemo(
    () => (baseUrl && roomCode ? `${baseUrl.replace(/\/+$/, '')}/join/${roomCode}` : ''),
    [baseUrl, roomCode],
  );

  const hostUrl = useMemo(
    () => (joinUrl && hostToken ? `${joinUrl}?hostToken=${hostToken}` : ''),
    [joinUrl, hostToken],
  );

  useEffect(() => {
    if (!joinUrl) return undefined;

    let alive = true;
    const options = {
      width: 512,
      margin: 2,
      errorCorrectionLevel: 'M',
      // Dark modules on a white card — the most scannable combination.
      color: { dark: '#140b26ff', light: '#ffffffff' },
    };

    QRCode.toDataURL(joinUrl, options).then((url) => {
      if (alive) setGuestQr(url);
    });

    if (hostUrl) {
      QRCode.toDataURL(hostUrl, options).then((url) => {
        if (alive) setHostQr(url);
      });
    }

    return () => {
      alive = false;
    };
  }, [joinUrl, hostUrl]);

  return (
    <aside className="qr-panel card">
      <h2 className="panel-title">Join the party</h2>

      {guestQr ? (
        <img className="qr-main" src={guestQr} alt="Scan to join Ondu Karaoke" />
      ) : (
        <div className="qr-main qr-skeleton" />
      )}

      <div className="room-code" aria-label={`Room code ${roomCode}`}>
        {roomCode}
      </div>

      <p className="qr-hint">
        Scan with a phone 📱
        <br />
        or open <span className="mono">{joinUrl || '…'}</span>
      </p>

      {hostQr && (
        <div className="host-remote">
          <h3>Host remote</h3>
          <img className="qr-small" src={hostQr} alt="Scan to become the host remote" />
          <p>Scan on the host&apos;s phone for skip, reorder and speed controls</p>
        </div>
      )}
    </aside>
  );
}
