# Cloudflare Forum KV Setup

The Signal Board forum backend is implemented in `src/worker.js` and uses a Cloudflare KV binding named `FORUM_POSTS`.

## Required binding

Binding name:

```text
FORUM_POSTS
```

## Cloudflare dashboard steps

1. Open Cloudflare dashboard.
2. Go to Workers & Pages.
3. Open the `matrixreprogrammed` Worker.
4. Go to Settings.
5. Open Bindings.
6. Add a KV namespace binding.
7. Create or select a namespace such as `matrix_forum_posts`.
8. Set the binding variable name exactly to:

```text
FORUM_POSTS
```

9. Save and redeploy.

## Routes implemented

- `GET /forum-feed` — reads public posts from KV.
- `POST /submit-forum-post` — saves a live post to KV.
- `POST /report-forum-post` — saves report records to KV.

## Behavior without KV

If the `FORUM_POSTS` binding is missing, the public page will still save posts locally on the visitor's device, but posts will not appear publicly across devices.

## Storage keys

- `posts:index` — latest public posts.
- `post:<id>` — individual post backup.
- `report:<id>` — report records.

## Security notes

The current forum is public-lightweight. It includes spam-trap handling and field limits. For a stronger public forum later, add moderation queue, rate limiting, Turnstile, and admin approval before posts become live.
