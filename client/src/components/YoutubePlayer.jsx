import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

/**
 * Thin wrapper around the YouTube IFrame Player API.
 *
 * The host page drives it through the ref:
 *   player.load(videoId, startSeconds)  → start (or resume) a song
 *   player.stop()                       → stop playback
 *   player.setRate(rate)                → playback speed
 *   player.getCurrentTime()             → where we are (drives the lyrics)
 *   player.loadedId                     → what is currently loaded
 *
 * Note: YouTube may play ads before/during the video. We accept that — we do
 * not try to block or strip them.
 */

let apiPromise = null;

/** Load the IFrame API script once and resolve when it is ready. */
function loadYouTubeApi() {
  if (!apiPromise) {
    apiPromise = new Promise((resolve) => {
      if (window.YT && window.YT.Player) {
        resolve(window.YT);
        return;
      }

      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof previous === 'function') previous();
        resolve(window.YT);
      };

      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      document.head.appendChild(script);
    });
  }
  return apiPromise;
}

const YoutubePlayer = forwardRef(function YoutubePlayer({ onEnded }, ref) {
  const container = useRef(null);
  const player = useRef(null);
  const rate = useRef(1);
  const finished = useRef(false);
  /** A load requested before the player was ready (slow API script). */
  const pending = useRef(null);

  // Always call the newest callback without re-creating the player.
  const endedHandler = useRef(onEnded);
  endedHandler.current = onEnded;

  /** Start a video — now or as soon as the player is ready. */
  const startVideo = (videoId, startSeconds) => {
    const instance = player.current;
    if (instance && typeof instance.loadVideoById === 'function') {
      instance.loadVideoById({ videoId, startSeconds: Math.max(0, startSeconds) });
    } else {
      pending.current = { videoId, startSeconds };
    }
  };

  useImperativeHandle(
    ref,
    () => {
      let loadedVideoId = null;

      return {
        load(videoId, startSeconds = 0) {
          finished.current = false;
          loadedVideoId = videoId;
          startVideo(videoId, startSeconds);
        },
        stop() {
          pending.current = null;
          try {
            player.current?.stopVideo();
          } catch {
            // Player not ready yet — nothing to stop.
          }
        },
        setRate(nextRate) {
          rate.current = nextRate;
          try {
            player.current?.setPlaybackRate(nextRate);
          } catch {
            // Not ready yet — we re-apply the rate on PLAYING.
          }
        },
        getCurrentTime() {
          try {
            const current = player.current?.getCurrentTime?.();
            return Number.isFinite(current) ? current : null;
          } catch {
            return null;
          }
        },
        get loadedId() {
          return loadedVideoId;
        },
      };
    },
    [],
  );

  useEffect(() => {
    let disposed = false;

    loadYouTubeApi().then((YT) => {
      if (disposed || !container.current || player.current) return;

      player.current = new YT.Player(container.current, {
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 1,
          controls: 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          iv_load_policy: 3,
        },
        events: {
          onReady: () => {
            try {
              player.current.setPlaybackRate(rate.current);
            } catch {
              // ignore
            }
            // A song was requested before the API finished loading.
            if (pending.current) {
              const { videoId, startSeconds } = pending.current;
              pending.current = null;
              startVideo(videoId, startSeconds);
            }
          },
          onStateChange: (event) => {
            // Re-apply the speed after every new video starts.
            if (event.data === YT.PlayerState.PLAYING) {
              try {
                player.current.setPlaybackRate(rate.current);
              } catch {
                // ignore
              }
            }
            if (event.data === YT.PlayerState.ENDED && !finished.current) {
              finished.current = true;
              endedHandler.current(true); // natural end → confetti + next song
            }
          },
          onError: () => {
            // Video cannot be embedded / is unavailable → auto-skip upstream.
            if (finished.current) return;
            finished.current = true;
            endedHandler.current(false);
          },
        },
      });
    });

    return () => {
      disposed = true;
      pending.current = null;
      try {
        player.current?.destroy();
      } catch {
        // ignore
      }
      player.current = null;
    };
  }, []);

  return (
    <div className="player-frame">
      <div ref={container} className="player-mount" />
    </div>
  );
});

export default YoutubePlayer;
