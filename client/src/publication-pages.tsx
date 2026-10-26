import type { TextEntity, TextStyle } from "@monitor/shared";
import { postHeading } from "@monitor/shared";
import { useEffect, useRef, useState } from "preact/hooks";
import type {
  Page,
  Post,
  PostImage,
  PublicationRun,
  Source,
} from "@monitor/shared";
import { api, useAction, useRemote, utc } from "./api";
import {
  Empty,
  ErrorNotice,
  Link,
  Loading,
  navigate,
  PageHeading,
  Pager,
} from "./components";

type DraftImage =
  | { id: string; name: string }
  | { base64: string; mimeType: string; name: string };
export function PostsPage() {
  const [page, setPage] = useState(1);
  const remote = useRemote<Page<Post>>(`/posts?page=${page}`, true);
  const sources = useRemote<Page<Source>>("/sources?pageSize=100");
  return (
    <>
      <PageHeading
        title="Posts"
        description="Reusable text and image posts."
        action={
          <Link class="button primary" href="/posts/new">
            New post
          </Link>
        }
      />
      <ErrorNotice message={remote.error} onRetry={remote.refresh} />
      <ErrorNotice message={sources.error} onRetry={sources.refresh} />
      {remote.loading && <Loading />}
      {remote.data && (
        <>
          {!remote.data.items.length && (
            <Empty title="No posts yet">
              Create a post to publish now or use in a schedule.
            </Empty>
          )}
          <div class="stack">
            {remote.data.items.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                sources={sources.data?.items || []}
                refresh={remote.refresh}
              />
            ))}
          </div>
          <Pager data={remote.data} onPage={setPage} />
        </>
      )}
      <Link class="button" href="/publications">
        Publication history
      </Link>
    </>
  );
}
function PostCard({
  post,
  sources,
  refresh,
}: {
  post: Post;
  sources: Source[];
  refresh: () => void;
}) {
  const action = useAction();
  const [sourceId, setSourceId] = useState("");
  const [queued, setQueued] = useState(false);
  return (
    <article class="card">
      <h2>{postHeading(post)}</h2>
      <p class="post-text">{post.text}</p>
      <ImageStrip images={post.images} />
      <p class="muted">Updated {utc(post.updatedAt)}</p>
      <ErrorNotice message={action.error} />
      <div class="actions">
        <Link class="button" href={`/posts/${post.id}/edit`}>
          Edit post
        </Link>
        <button
          type="button"
          disabled={action.busy}
          onClick={() => {
            if (
              confirm(
                `Delete “${postHeading(post)}”? Published Telegram messages remain.`,
              )
            )
              void action.run(async () => {
                await api(`/posts/${post.id}`, { method: "DELETE" });
                refresh();
              });
          }}
        >
          Delete post
        </button>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void action.run(async () => {
            await api("/publications", {
              method: "POST",
              body: { postId: post.id, sourceId },
            });
            setQueued(true);
          });
        }}
      >
        <DestinationSelect
          sources={sources}
          value={sourceId}
          onChange={setSourceId}
        />
        <button class="primary" disabled={action.busy || !sourceId}>
          Publish now
        </button>
        {queued && (
          <p role="status">
            Publication queued. <Link href="/publications">View progress</Link>
          </p>
        )}
      </form>
    </article>
  );
}
export function DestinationSelect({
  required = true,
  placeholder = "Choose a group or forum topic",
  sources,
  value,
  onChange,
}: {
  required?: boolean;
  placeholder?: string;
  sources: Source[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label class="field">
      Destination
      <select
        required={required}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        <option value="">{placeholder}</option>
        {sources
          .filter(
            (source) => source.kind === "group" || source.kind === "topic",
          )
          .map((source) => (
            <option key={source.id} value={source.id}>
              {source.name}
            </option>
          ))}
      </select>
      <small>
        Add the destination in Sources first. Publication uses your personal
        account.
      </small>
    </label>
  );
}
function ImageStrip({ images }: { images: PostImage[] }) {
  return (
    <div class="post-images">
      {images.map((image) => (
        <img
          key={image.id}
          src={`/api/post-images/${image.id}`}
          alt="Post attachment"
          loading="lazy"
        />
      ))}
    </div>
  );
}
export function PostEditorPage({ id }: { id?: string }) {
  const remote = useRemote<Post>(id ? `/posts/${id}` : null);
  const action = useAction();
  const [text, setText] = useState("");
  const [entities, setEntities] = useState<TextEntity[]>([]);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [style, setStyle] = useState<TextStyle>("bold");
  const [url, setUrl] = useState("");
  const [formatError, setFormatError] = useState("");
  const moveImage = (index: number, direction: number) =>
    setImages((current) => {
      const next = [...current];
      [next[index], next[index + direction]] = [
        next[index + direction]!,
        next[index]!,
      ];
      return next;
    });
  const changeText = (next: string) => {
    let start = 0;
    while (
      start < text.length &&
      start < next.length &&
      text[start] === next[start]
    )
      start++;
    let end = text.length;
    let nextEnd = next.length;
    while (
      end > start &&
      nextEnd > start &&
      text[end - 1] === next[nextEnd - 1]
    ) {
      end--;
      nextEnd--;
    }
    const delta = nextEnd - end;
    setEntities((current) =>
      current.flatMap((entity) => {
        if (entity.offset + entity.length <= start) return [entity];
        if (entity.offset >= end)
          return [{ ...entity, offset: entity.offset + delta }];
        if (entity.offset <= start && entity.offset + entity.length >= end) {
          const length = entity.length + delta;
          return length > 0 ? [{ ...entity, length }] : [];
        }
        return [];
      }),
    );
    setText(next);
  };
  const [images, setImages] = useState<DraftImage[]>([]);
  useEffect(() => {
    if (remote.data) {
      setText(remote.data.text);
      setEntities(remote.data.entities ?? []);
      setImages(remote.data.images);
    }
  }, [remote.data]);
  return (
    <>
      <PageHeading
        title={id ? "Edit post" : "New post"}
        description="Formatted text, with up to ten JPEG or PNG images."
      />
      {id && (
        <p class="footnote">
          Changes apply to future publications. Retrying a failed run uses its
          original content.
        </p>
      )}
      <ErrorNotice message={remote.error} onRetry={remote.refresh} />
      <ErrorNotice message={action.error} />
      {remote.loading ? (
        <Loading />
      ) : (
        <form
          class="card"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(async () => {
              await api(id ? `/posts/${id}` : "/posts", {
                method: id ? "PUT" : "POST",
                body: { text, entities, images },
              });
              navigate("/posts");
            });
          }}
        >
          <label class="field">
            Text
            <textarea
              ref={textarea}
              rows={8}
              value={text}
              maxLength={images.length ? 1024 : 4096}
              onInput={(event) => changeText(event.currentTarget.value)}
            />
            <small>
              {text.length} / {images.length ? 1024 : 4096} characters
            </small>
          </label>
          <fieldset>
            <legend>Text formatting</legend>
            <p>
              Select text above, choose a style, then apply. Code and
              preformatted ranges cannot overlap other styles.
            </p>
            <label class="field">
              Style
              <select
                value={style}
                onChange={(event) =>
                  setStyle(event.currentTarget.value as TextStyle)
                }
              >
                {(
                  [
                    "bold",
                    "italic",
                    "underline",
                    "strike",
                    "spoiler",
                    "code",
                    "pre",
                    "link",
                    "blockquote",
                  ] as TextStyle[]
                ).map((value) => (
                  <option value={value}>{value}</option>
                ))}
              </select>
            </label>
            {style === "link" && (
              <label class="field">
                Link URL
                <input
                  type="url"
                  value={url}
                  onInput={(event) => setUrl(event.currentTarget.value)}
                />
              </label>
            )}
            <button
              type="button"
              onClick={() => {
                const field = textarea.current;
                if (!field || field.selectionEnd <= field.selectionStart) {
                  setFormatError("Select text to format first.");
                  return;
                }
                setEntities((current) => [
                  ...current,
                  {
                    type: style,
                    offset: field.selectionStart,
                    length: field.selectionEnd - field.selectionStart,
                    ...(style === "link" ? { url } : {}),
                  },
                ]);
                setFormatError("");
              }}
            >
              Apply to selected text
            </button>
            <ErrorNotice message={formatError} />
            <ul>
              {entities.map((entity, index) => (
                <li>
                  {entity.type}: “
                  {text.slice(entity.offset, entity.offset + entity.length)}”
                  {entity.url ? ` (${entity.url})` : ""}
                  <button
                    type="button"
                    onClick={() =>
                      setEntities((current) =>
                        current.filter((_, i) => i !== index),
                      )
                    }
                  >
                    Remove formatting {index + 1}
                  </button>
                </li>
              ))}
            </ul>
          </fieldset>
          <label class="field">
            Add images
            <input
              type="file"
              accept="image/jpeg,image/png"
              multiple
              disabled={action.busy}
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files || []);
                event.currentTarget.value = "";
                void action.run(async () => {
                  if (
                    images.length + files.length > 10 ||
                    files.some((file) => file.size > 5 * 1024 * 1024)
                  )
                    throw new Error(
                      "Use at most ten images, each up to 5 MiB; total limit 20 MiB.",
                    );
                  const added = await Promise.all(
                    files.map(async (file) => {
                      const base64 = await new Promise<string>(
                        (resolve, reject) => {
                          const reader = new FileReader();
                          reader.onerror = () =>
                            reject(new Error("Cannot read image."));
                          reader.onload = () =>
                            resolve(String(reader.result).split(",")[1]!);
                          reader.readAsDataURL(file);
                        },
                      );
                      return { name: file.name, mimeType: file.type, base64 };
                    }),
                  );
                  setImages((current) => [...current, ...added]);
                });
              }}
            />
            <small>
              5 MiB per image, 20 MiB per post. Images are sent in the order
              shown.
            </small>
          </label>
          <div class="stack">
            {images.map((image, index) => (
              <div class="image-draft" key={"id" in image ? image.id : index}>
                <img
                  src={
                    "id" in image
                      ? `/api/post-images/${image.id}`
                      : `data:${image.mimeType};base64,${image.base64}`
                  }
                  alt={`Image ${index + 1}`}
                />
                <span>
                  {index + 1}. {image.name}
                </span>
                <button
                  type="button"
                  disabled={index === 0}
                  aria-label={`Move image ${index + 1} earlier`}
                  onClick={() => moveImage(index, -1)}
                >
                  Move earlier
                </button>
                <button
                  type="button"
                  disabled={index === images.length - 1}
                  aria-label={`Move image ${index + 1} later`}
                  onClick={() => moveImage(index, 1)}
                >
                  Move later
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setImages((current) =>
                      current.filter((_, i) => i !== index),
                    )
                  }
                >
                  Remove image {index + 1}
                </button>
              </div>
            ))}
          </div>
          <div class="actions">
            <button class="primary" disabled={action.busy}>
              Save post
            </button>
            <Link class="button" href="/posts">
              Cancel
            </Link>
          </div>
        </form>
      )}
    </>
  );
}
export function PublicationsPage() {
  const [page, setPage] = useState(1);
  const remote = useRemote<Page<PublicationRun>>(
    `/publications?page=${page}`,
    true,
  );
  return (
    <>
      <PageHeading
        title="Publication history"
        description="Sent messages, replacement progress and results needing review."
      />
      <ErrorNotice message={remote.error} onRetry={remote.refresh} />
      {remote.loading && <Loading />}
      {remote.data && (
        <>
          {!remote.data.items.length && <Empty title="No publications yet" />}
          <div class="stack">
            {remote.data.items.map((run) => (
              <RunCard key={run.id} run={run} refresh={remote.refresh} />
            ))}
          </div>
          <Pager data={remote.data} onPage={setPage} />
        </>
      )}
    </>
  );
}
function RunCard({
  run,
  refresh,
}: {
  run: PublicationRun;
  refresh: () => void;
}) {
  const action = useAction();
  const [ids, setIds] = useState(run.sentIds.join(", "));
  const [confirmed, setConfirmed] = useState(false);
  return (
    <article class="card">
      <h2>{run.postName}</h2>
      <p>
        {run.destination.name} · <strong>{run.status}</strong>
      </p>
      <p class="muted">
        Created {utc(run.createdAt)}
        {run.completedAt ? ` · Completed ${utc(run.completedAt)}` : ""}
      </p>
      <p>Sent message IDs: {run.sentIds.join(", ") || "None recorded"}</p>
      {!!run.previousIds.length && (
        <p>
          Previous messages deleted: {run.deletedIds.length} /{" "}
          {run.previousIds.length} at{" "}
          {run.previousDestination?.name || run.destination.name}
        </p>
      )}
      {run.error && (
        <p role="status">
          {publicationFailureMessage(run)}
          <br />
          <small>Error: {run.error}</small>
        </p>
      )}
      <ErrorNotice message={action.error} />
      {run.status === "failed" && (
        <button
          type="button"
          disabled={action.busy}
          onClick={() =>
            void action.run(async () => {
              await api(`/publications/${run.id}/retry`, { method: "POST" });
              refresh();
            })
          }
        >
          Retry run
        </button>
      )}
      {(run.status === "queued" || run.status === "failed") && (
        <button
          type="button"
          disabled={action.busy}
          onClick={() => {
            if (
              confirm(
                "Cancel this run? Any messages already deleted remain deleted.",
              )
            )
              void action.run(async () => {
                await api(`/publications/${run.id}/cancel`, { method: "POST" });
                refresh();
              });
          }}
        >
          Cancel run
        </button>
      )}
      {run.status === "uncertain" && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(async () => {
              await api(`/publications/${run.id}/reconcile`, {
                method: "POST",
                body: {
                  confirmed,
                  messageIds: ids.trim() ? ids.trim().split(/[\s,]+/) : [],
                },
              });
              refresh();
            });
          }}
        >
          <p>
            Check this destination in Telegram before proceeding. Include every
            message from this run, including all album images. Leave IDs empty
            only if you verified that nothing was published. Uncertain runs are
            never automatically resent.
          </p>
          <label class="field">
            Confirmed message IDs
            <input
              value={ids}
              onInput={(event) => setIds(event.currentTarget.value)}
              placeholder="123, 124"
            />
          </label>
          <label class="check">
            <input
              type="checkbox"
              required
              checked={confirmed}
              onChange={(event) => setConfirmed(event.currentTarget.checked)}
            />
            I checked Telegram and confirmed these system-created messages, or
            confirmed nothing was sent.
          </label>
          <button disabled={action.busy || !confirmed}>
            Save reviewed result
          </button>
        </form>
      )}
    </article>
  );
}

function publicationFailureMessage(run: PublicationRun): string {
  const messages: Record<string, string> = {
    SEND_AS_PEER_INVALID:
      "Telegram rejected the sender identity for this destination.",
    CHAT_SEND_PHOTOS_FORBIDDEN:
      "Your account is not allowed to send photos to this group.",
    CHAT_SEND_MEDIA_FORBIDDEN:
      "Your account is not allowed to send media to this group.",
    CHAT_WRITE_FORBIDDEN: "Your account is not allowed to post in this group.",
    USER_BANNED_IN_CHANNEL:
      "Your account is restricted from posting in this group.",
    MEDIA_CAPTION_TOO_LONG:
      "Telegram rejected the caption length. Cancel this run, shorten the post and publish again.",
    PHOTO_INVALID_DIMENSIONS:
      "Telegram rejected an image's dimensions. Cancel this run and replace that image.",
    TOPIC_CLOSED: "This forum topic is closed.",
    TOPIC_DELETED: "This forum topic was deleted.",
    TELEGRAM_WAIT:
      "Telegram requested a wait. Retry after the connector's wait period ends.",
    PUBLICATION_PREPARATION: "Preparing the publication failed before sending.",
    PUBLICATION_REJECTED:
      "Telegram rejected the publication without sending it.",
    PUBLICATION_UNCERTAIN:
      run.status === "failed"
        ? "You confirmed that nothing was published. The original send result was uncertain; you can now retry or cancel."
        : "The send result is uncertain. Check Telegram before retrying.",
    PUBLICATION_REVIEWED: run.sentIds.length
      ? "The partial publication was reviewed."
      : "You confirmed that nothing was published. Retry this run or cancel it.",
    PUBLICATION_DELETE:
      "Deleting the previous publication failed. Replacement stopped.",
  };
  return (
    messages[run.error || ""] ||
    "Publication failed. Check the error code before retrying."
  );
}
