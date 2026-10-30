import { confirmAction, ErrorDialog } from "./dialog";
import { Button } from "./web-awesome";
import { EntityList, type BulkAction } from "./entity-list";
import { PostTextEditor } from "./post-text-editor";
import type { TextEntity } from "@monitor/shared";
import { postHeading } from "@monitor/shared";
import { useEffect, useState } from "preact/hooks";
import type {
  Page,
  Post,
  PostImage,
  PublicationRun,
  Source,
} from "@monitor/shared";
import { api, useAction, useRemote, utc } from "./api";
import {
  ErrorNotice,
  Link,
  Loading,
  navigate,
  PageHeading,
} from "./components";

type DraftImage =
  | { id: string; name: string }
  | { base64: string; mimeType: string; name: string };
export function PostsPage() {
  const [page, setPage] = useState(1);
  const remote = useRemote<Page<Post>>(`/posts?page=${page}`, true);
  const bulkActions: BulkAction<Post>[] = [
    {
      label: "Delete",
      confirm:
        "Their publication history is also deleted. Published Telegram messages remain. Posts used by schedules cannot be deleted.",
      run: (post) => api(`/posts/${post.id}`, { method: "DELETE" }),
    },
  ];
  return (
    <>
      <PageHeading
        title="Posts"
        description="Reusable content. Choose destinations and publishing times in Schedules."
        action={
          <Link class="button primary" href="/posts/new">
            New post
          </Link>
        }
      />
      <EntityList
        data={remote.data}
        loading={remote.loading}
        error={remote.error}
        refresh={remote.refresh}
        onPage={setPage}
        scope={page}
        actions={bulkActions}
        itemLabel={(post) => postHeading(post)}
        renderItem={(post) => <PostCard post={post} refresh={remote.refresh} />}
        emptyTitle="No posts yet"
        emptyDescription={
          "Create a post, then use a schedule to choose where and when to publish it."
        }
      />
    </>
  );
}
function PostCard({ post, refresh }: { post: Post; refresh: () => void }) {
  const action = useAction();
  return (
    <wa-card role="article" class="card">
      <h2>{postHeading(post)}</h2>
      <p class="post-text">{post.text}</p>
      <ImageStrip images={post.images} />
      <p class="muted">Updated {utc(post.updatedAt)}</p>
      <ErrorDialog message={action.error} onClose={action.clear} />
      <div class="actions">
        <Link
          class="button"
          href={`/schedules/new?post=${encodeURIComponent(post.id)}`}
        >
          Create schedule
        </Link>
        <Link class="button" href={`/posts/${post.id}/edit`}>
          Edit post
        </Link>
        <Button
          type="button"
          disabled={action.busy}
          onClick={async () => {
            if (
              await confirmAction(
                `Delete “${postHeading(post)}” and its publication history? Published Telegram messages remain.`,
              )
            )
              void action.run(async () => {
                await api(`/posts/${post.id}`, { method: "DELETE" });
                refresh();
              });
          }}
        >
          Delete post
        </Button>
      </div>
    </wa-card>
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
    <div class="field">
      <wa-select
        label="Destination"
        required={required}
        value={value}
        onChange={(event) => onChange(String(event.currentTarget.value))}
      >
        <small slot="hint">
          Add the destination in Sources first. Publication uses your personal
          account.
        </small>
        <wa-option value="">{placeholder}</wa-option>
        {sources
          .filter(
            (source) => source.kind === "group" || source.kind === "topic",
          )
          .map((source) => (
            <wa-option key={source.id} value={source.id}>
              {source.name}
            </wa-option>
          ))}
      </wa-select>
    </div>
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
  const moveImage = (index: number, direction: number) =>
    setImages((current) => {
      const next = [...current];
      [next[index], next[index + direction]] = [
        next[index + direction]!,
        next[index]!,
      ];
      return next;
    });
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
      <ErrorDialog message={action.error} onClose={action.clear} />
      {remote.loading ? (
        <Loading />
      ) : (
        <form
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
          <wa-card class="card">
            <PostTextEditor
              value={{ text, entities }}
              maxLength={images.length ? 1024 : 4096}
              onChange={(value) => {
                setText(value.text);
                setEntities(value.entities);
              }}
            />
            <div class="field">
              <label for="post-images">Add images</label>
              <input
                id="post-images"
                aria-describedby="post-image-help"
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
              <small id="post-image-help">
                5 MiB per image, 20 MiB per post. Images are sent in the order
                shown.
              </small>
            </div>
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
                  <Button
                    type="button"
                    disabled={index === 0}
                    aria-label={`Move image ${index + 1} earlier`}
                    onClick={() => moveImage(index, -1)}
                  >
                    Move earlier
                  </Button>
                  <Button
                    type="button"
                    disabled={index === images.length - 1}
                    aria-label={`Move image ${index + 1} later`}
                    onClick={() => moveImage(index, 1)}
                  >
                    Move later
                  </Button>
                  <Button
                    type="button"
                    onClick={() =>
                      setImages((current) =>
                        current.filter((_, i) => i !== index),
                      )
                    }
                  >
                    Remove image {index + 1}
                  </Button>
                </div>
              ))}
            </div>
            <div class="actions">
              <Button
                variant="brand"
                appearance="accent"
                type="submit"
                class="primary"
                disabled={
                  action.busy || text.length > (images.length ? 1024 : 4096)
                }
              >
                Save post
              </Button>
              <Link class="button" href="/posts">
                Cancel
              </Link>
            </div>
          </wa-card>
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
  const bulkActions: BulkAction<PublicationRun>[] = [
    {
      label: "Delete",
      eligible: (run) => ["sent", "partial", "cancelled"].includes(run.status),
      confirm:
        "Only completed history is deleted. Telegram messages and schedule replacement tracking remain.",
      run: (run) => api(`/publications/${run.id}`, { method: "DELETE" }),
    },
    {
      label: "Retry",
      eligible: (run) => run.status === "failed",
      run: (run) => api(`/publications/${run.id}/retry`, { method: "POST" }),
    },
    {
      label: "Cancel runs",
      eligible: (run) => ["queued", "failed"].includes(run.status),
      confirm: "Messages already deleted remain deleted.",
      run: (run) => api(`/publications/${run.id}/cancel`, { method: "POST" }),
    },
  ];
  return (
    <>
      <PageHeading
        title="Publication history"
        description="Sent messages, replacement progress and results needing review."
      />
      <EntityList
        data={remote.data}
        loading={remote.loading}
        error={remote.error}
        refresh={remote.refresh}
        onPage={setPage}
        scope={page}
        actions={bulkActions}
        itemLabel={(run) => run.postName}
        renderItem={(run) => <RunCard run={run} refresh={remote.refresh} />}
        emptyTitle="No publications yet"
        emptyDescription={undefined}
      />
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
    <wa-card role="article" class="card">
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
      <ErrorDialog message={action.error} onClose={action.clear} />
      {run.status === "failed" && (
        <Button
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
        </Button>
      )}
      {(run.status === "queued" || run.status === "failed") && (
        <Button
          type="button"
          disabled={action.busy}
          onClick={async () => {
            if (
              await confirmAction(
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
        </Button>
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
          <div class="field">
            <wa-input
              label="Confirmed message IDs"
              value={ids}
              onInput={(event) => setIds(String(event.currentTarget.value))}
              placeholder="123, 124"
            ></wa-input>
          </div>
          <wa-checkbox
            class="check"
            required
            checked={confirmed}
            onChange={(event) => setConfirmed(event.currentTarget.checked)}
          >
            I checked Telegram and confirmed these system-created messages, or
            confirmed nothing was sent.
          </wa-checkbox>
          <Button type="submit" disabled={action.busy || !confirmed}>
            Save reviewed result
          </Button>
        </form>
      )}
    </wa-card>
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
