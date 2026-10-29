import { Dialog } from "./dialog";
import { useEffect, useRef, useState } from "preact/hooks";
import type { Match, MatchImage } from "@monitor/shared";
import { useRemote } from "./api";
import { ErrorNotice } from "./components";

const imageUrl = (
  matchId: string,
  image: MatchImage,
  size: "preview" | "full",
  attempt = 0,
) =>
  `/api/matches/${encodeURIComponent(matchId)}/images/${encodeURIComponent(image.externalItemId)}?size=${size}&attempt=${attempt}`;

export function MatchImageGallery({ match }: { match: Match }) {
  if (!match.attachments.some((attachment) => attachment.type === "image"))
    return null;
  return <ImageGallery match={match} />;
}
function ImageGallery({ match }: { match: Match }) {
  const element = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [selected, setSelected] = useState<number>();
  const images = useRemote<MatchImage[]>(
    visible ? `/matches/${match.id}/images` : null,
  );
  useEffect(() => {
    if (!element.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(element.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={element} class="match-image-gallery" aria-label="Message images">
      {!visible || images.loading ? (
        <p class="muted" role="status">
          Loading image previews…
        </p>
      ) : null}
      <ErrorNotice message={images.error} onRetry={images.refresh} />
      {images.data && !images.data.length && (
        <p class="muted">Original images are unavailable.</p>
      )}
      {images.data &&
        images.data.length > 0 &&
        images.data.length <
          match.attachments.filter((attachment) => attachment.type === "image")
            .length && (
          <p class="muted">Some original images are unavailable.</p>
        )}
      <div class="match-image-thumbnails">
        {images.data?.map((image, index) => (
          <ImageThumbnail
            key={image.externalItemId}
            matchId={match.id}
            image={image}
            index={index}
            onOpen={() => setSelected(index)}
          />
        ))}
      </div>
      {selected !== undefined && images.data && (
        <ImageViewer
          matchId={match.id}
          images={images.data}
          initialIndex={selected}
          onClose={() => setSelected(undefined)}
        />
      )}
    </div>
  );
}
function ImageThumbnail({
  matchId,
  image,
  index,
  onOpen,
}: {
  matchId: string;
  image: MatchImage;
  index: number;
  onOpen: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  return (
    <div class="match-image-thumbnail">
      <button
        type="button"
        class="match-image-open"
        aria-label={`Open image ${index + 1}`}
        onClick={onOpen}
      >
        {failed ? (
          <span>
            Preview unavailable
            <br />
            Open image {index + 1}
          </span>
        ) : (
          <img
            loading="lazy"
            decoding="async"
            src={imageUrl(matchId, image, "preview", attempt)}
            alt={`Message image ${index + 1}`}
            onError={() => setFailed(true)}
          />
        )}
      </button>
      {failed && (
        <button
          type="button"
          onClick={() => {
            setFailed(false);
            setAttempt((value) => value + 1);
          }}
        >
          Retry preview {index + 1}
        </button>
      )}
    </div>
  );
}
function ImageViewer({
  matchId,
  images,
  initialIndex,
  onClose,
}: {
  matchId: string;
  images: MatchImage[];
  initialIndex: number;
  onClose: () => void;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const [index, setIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const image = images[index]!;
  const move = (next: number) => {
    closeButton.current?.focus();
    setIndex(next);
    setZoom(1);
    setLoading(true);
    setFailed(false);
    setAttempt(0);
    stage.current?.scrollTo(0, 0);
  };
  return (
    <Dialog
      class="match-image-dialog"
      aria-label="Message image viewer"
      onClose={onClose}
      closeOnBackdrop
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" && index > 0) {
          event.preventDefault();
          move(index - 1);
        }
        if (event.key === "ArrowRight" && index < images.length - 1) {
          event.preventDefault();
          move(index + 1);
        }
      }}
    >
      <div class="match-image-viewer-heading">
        <h2>
          Image {index + 1} of {images.length}
        </h2>
        <button
          type="button"
          ref={closeButton}
          autoFocus
          onClick={onClose}
        >
          Close image
        </button>
      </div>
      <div class="actions" aria-label="Image controls">
        {images.length > 1 && (
          <>
            <button
              type="button"
              disabled={index === 0}
              onClick={() => move(index - 1)}
            >
              Previous image
            </button>
            <button
              type="button"
              disabled={index === images.length - 1}
              onClick={() => move(index + 1)}
            >
              Next image
            </button>
          </>
        )}
        <button
          type="button"
          disabled={zoom <= 1 || failed || loading}
          onClick={() => setZoom((value) => Math.max(1, value - 0.5))}
        >
          Zoom out
        </button>
        <button
          type="button"
          disabled={zoom >= 4 || failed || loading}
          onClick={() => setZoom((value) => Math.min(4, value + 0.5))}
        >
          Zoom in
        </button>
        <button
          type="button"
          disabled={zoom === 1}
          onClick={() => {
            setZoom(1);
            stage.current?.scrollTo(0, 0);
          }}
        >
          Fit image
        </button>
        <span class="muted" role="status">
          {zoom === 1 ? "Fit to screen" : `${Math.round(zoom * 100)}%`}
        </span>
      </div>
      {loading && <p role="status">Loading image…</p>}
      {failed && (
        <div role="status">
          <p>
            Unable to load this image. It may be deleted, inaccessible,
            unsupported, or larger than 10 MiB.
          </p>
          <button
            type="button"
            onClick={() => {
              setFailed(false);
              setLoading(true);
              setAttempt((value) => value + 1);
            }}
          >
            Retry image
          </button>
        </div>
      )}
      <div
        ref={stage}
        class={`match-image-stage${zoom > 1 ? " zoomed" : ""}`}
        style={{ "--image-zoom": zoom }}
      >
        {!failed && (
          <button
            type="button"
            class="match-image-zoom-target"
            aria-label={zoom === 1 ? "Zoom image" : "Fit image to screen"}
            onClick={() => setZoom((value) => (value === 1 ? 2 : 1))}
          >
            <img
              key={`${image.externalItemId}:${attempt}`}
              src={imageUrl(matchId, image, "full", attempt)}
              alt={`Message image ${index + 1} enlarged`}
              onLoad={() => setLoading(false)}
              onError={() => {
                setFailed(true);
                setLoading(false);
              }}
            />
          </button>
        )}
      </div>
    </Dialog>
  );
}
