import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/**
 * LEFT column of the host screen: the join QR code (always visible) with the
 * room code underneath, the host password, share buttons, plus a smaller
 * "host remote" QR that turns a phone into the host controller.
 *
 * `baseUrl` is the origin phones can reach (the LAN address when the host
 * screen runs on localhost). The room path is appended here so the QR always
 * points at THIS room's join page.
 */
export default function QrPanel({
  baseUrl,
  roomCode,
  hostToken,
  hostPassword = '',
  onShare,
  onCopy,
  onCopyPassword,
}) {
  const [guestQr, setGuestQr] = useState('');
  const [hostQr, setHostQr] = useState('');

  const joinUrl = `${
    (baseUrl || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/+$/, '')
  }/join/${roomCode}`;
  const hostUrl = `${joinUrl}?hostToken=${hostToken}`;

  useEffect(() => {
    if (!joinUrl || joinUrl.endsWith('/join/undefined')) return undefined;

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

    if (hostToken) {
      QRCode.toDataURL(hostUrl, options).then((url) => {
        if (alive) setHostQr(url);
      });
    }

    return () => {
      alive = false;
    };
  }, [joinUrl, hostUrl, hostToken]);

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

      <div className="share-row">
        <button type="button" className="btn btn-cyan share-btn" onClick={() => onShare?.(joinUrl)}>
          📤 Share
        </button>
        <button type="button" className="btn btn-ghost share-btn" onClick={() => onCopy?.(joinUrl)}>
          🔗 Copy link
        </button>
      </div>

      <p className="qr-hint">
        Scan with a phone 📱
        <br />
        or open <span className="mono">{joinUrl}</span>
      </p>

      {/* Folded away by default so the QR + room code fit one TV screen. */}
      {(hostPassword || hostQr) && (
        <details className="host-tools">
          <summary>
            🔐 Host password &amp; remote
            <span className="host-tools-chevron" aria-hidden="true">▾</span>
          </summary>
          <div className="host-tools-body">
            {hostPassword && (
              <div className="host-password">
                <div className="host-password-head">
                  <span className="host-password-label">Host password</span>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => onCopyPassword?.(hostPassword)}
                    title="Copy the password"
                  >
                    copy
                  </button>
                </div>
                <div className="host-password-value">{hostPassword}</div>
                <p className="host-password-hint">
                  Write it down — use it to get back into this room if you press back
                  or close the tab.
                </p>
              </div>
            )}

            {hostQr && (
              <div className="host-remote">
                <h3>Host remote</h3>
                <img className="qr-small" src={hostQr} alt="Scan to become the host remote" />
                <p>Scan on the host&apos;s phone for skip, reorder and speed controls</p>
              </div>
            )}
          </div>
        </details>
      )}
    </aside>
  );
}
