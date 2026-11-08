# The Conduit API

A local HTTP service for Conduit, the RealWorld blogging app. It implements the
[RealWorld API spec](https://github.com/realworld-apps/realworld/tree/main/specs/api)
(`openapi.yml`, v2). It is given and running; it is the only backend there is.

```
node api/server.mjs --port=8380        # http://127.0.0.1:8380
```

Base URL: `http://127.0.0.1:8380/api`

- JSON in and out (`Content-Type: application/json`). Cross-origin requests are
  allowed from anywhere, all methods, with the `Authorization` header.
- Times are ISO 8601 UTC strings: `"2026-10-14T09:12:40.000Z"`.
- The community is the same on every start: 12 users, 60 articles, 15 tags,
  about 150 comments, with follows and favorites, dated over the past six
  months. Writes last until the process stops.

**Demo account:** email `jake@jake.jake`, password `jakejake` (username `jake`).
Jake follows four people, so his feed has articles.

---

## Authentication

Register or log in to get a token (a JWT). Send it on every request that needs
a user:

```
Authorization: Token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwi…
```

Some endpoints need it (**auth required**), some use it when present to fill in
`following` and `favorited` (**auth optional**). Without a token those are
`false`. A missing token on an auth-required endpoint is `401`
`{"errors":{"token":["is missing"]}}`; a token that is malformed, expired (60
days) or for a user that no longer exists is `401`
`{"errors":{"token":["is invalid"]}}` on any endpoint.

---

## Errors

Every error has the same shape: field names, each with a list of messages.

```json
422 { "errors": { "title": ["can't be blank"], "body": ["can't be blank"] } }
```

| Status | When | Example |
|---|---|---|
| 401 | no or bad token; wrong login | `{"errors":{"token":["is missing"]}}`, `{"errors":{"credentials":["invalid"]}}` |
| 403 | not yours to change | `{"errors":{"article":["forbidden"]}}`, `{"errors":{"comment":["forbidden"]}}` |
| 404 | no such article, profile or comment | `{"errors":{"article":["not found"]}}`, `{"errors":{"profile":["not found"]}}` |
| 409 | registering a taken username or email | `{"errors":{"username":["has already been taken"]}}` |
| 422 | validation | `can't be blank`, `is invalid`, `is too short (minimum is 8 characters)` |

`can't be blank`: missing, `null` or empty. `is invalid`: wrong format or type
(an email that isn't one, a `tagList` that isn't a list of strings, a bad
`limit`). Several fields can fail at once.

---

## Shapes

**User** (only ever your own):

```json
{ "user": { "email": "jake@jake.jake", "token": "eyJ…", "username": "jake",
            "bio": "Frontend developer in Lisbon…", "image": "http://127.0.0.1:8380/images/avatars/jake.svg" } }
```

**Profile**:

```json
{ "profile": { "username": "tomasz", "bio": "SRE at a payments company…", "image": null, "following": false } }
```

`bio` and `image` may be `null` (several people have no image). `image` is a
URL; the seeded ones are served by this service.

**Article**:

```json
{ "article": {
    "slug": "how-i-structure-small-javascript-projects",
    "title": "How I Structure Small JavaScript Projects",
    "description": "Folders, modules and the few rules I actually follow.",
    "body": "Folders, modules and…\n\n## Getting started\n\n…",
    "tagList": ["javascript", "webdev"],
    "createdAt": "2026-07-02T14:31:05.000Z",
    "updatedAt": "2026-07-02T14:31:05.000Z",
    "favorited": false,
    "favoritesCount": 4,
    "author": { "username": "jake", "bio": "…", "image": "http://127.0.0.1:8380/images/avatars/jake.svg", "following": false } } }
```

`body` is Markdown. Titles, descriptions, bodies, comments and bios are
user-written text and may contain anything, HTML included. `tagList` keeps the
order it was written in.

**Comment**:

```json
{ "comment": { "id": 154, "createdAt": "2026-11-08T12:03:10.000Z", "updatedAt": "2026-11-08T12:03:10.000Z",
               "body": "Great write-up, thanks for sharing!", "author": { "username": "jake", "…": "a profile" } } }
```

---

## Users

### `POST /api/users` — register

```json
→ { "user": { "username": "ana", "email": "ana@example.com", "password": "correct-horse" } }
201 { "user": { "email": "ana@example.com", "token": "eyJ…", "username": "ana", "bio": null, "image": null } }
```

All three required. `email` must be an email address; `password` at least 8
characters; `username` at most 40 characters, without spaces, `/`, `?`, `#` or `%`. A taken username or email
(ignoring case) is `409`.

### `POST /api/users/login`

```json
→ { "user": { "email": "jake@jake.jake", "password": "jakejake" } }
200 { "user": { …, "token": "eyJ…" } }
```

Blank or malformed fields are `422`; a wrong email or password is `401`
`{"errors":{"credentials":["invalid"]}}`.

### `GET /api/user` — auth required

The current user, with a fresh `token`.

### `PUT /api/user` — auth required

Send only what changes: any of `email`, `username`, `password`, `bio`, `image`.

```json
→ { "user": { "bio": "I like to skateboard", "image": "https://example.com/me.jpg" } }
200 { "user": { …updated, with a fresh token } }
```

`bio` and `image` accept `null`; an empty string is stored as `null`. `email`,
`username` and `password` can't be blank or `null`; `password` at least 8
characters. A username or email another user has is `422` `has already been
taken`. Old tokens keep working after a username change.

---

## Profiles

### `GET /api/profiles/:username` — auth optional

`200 { "profile": … }`, or `404` `{"errors":{"profile":["not found"]}}`.

### `POST /api/profiles/:username/follow` — auth required
### `DELETE /api/profiles/:username/follow` — auth required

Follow or unfollow; returns the profile with `following` updated. Both are
idempotent. You can't follow yourself (`422`).

---

## Articles

### `GET /api/articles?tag=&author=&favorited=&limit=&offset=` — auth optional

Most recent first. Filters combine:

| Parameter | |
|---|---|
| `tag` | articles with this tag |
| `author` | articles by this username |
| `favorited` | articles this username has favorited |
| `limit` | page size, default `20`, at least 1 |
| `offset` | how many to skip, default `0` |

```json
{ "articles": [ { "slug": "…", "title": "…", "description": "…", "tagList": [ ],
                  "createdAt": "…", "updatedAt": "…", "favorited": false, "favoritesCount": 3,
                  "author": { … } } ],
  "articlesCount": 60 }
```

List entries have **no `body`**. `articlesCount` is the total matching, for
pagination (`offset = (page − 1) × limit`). An unknown author or user gives an
empty list.

### `GET /api/articles/feed?limit=&offset=` — auth required

Articles by people you follow, most recent first, same shape and paging.

### `GET /api/articles/:slug` — auth optional

`200 { "article": … }` with `body`, or `404` `{"errors":{"article":["not found"]}}`.

### `POST /api/articles` — auth required

```json
→ { "article": { "title": "How to train your dragon", "description": "Ever wonder how?",
                 "body": "You have to believe", "tagList": ["dragons", "training"] } }
201 { "article": { "slug": "how-to-train-your-dragon", … } }
```

`title`, `description`, `body` required; `tagList` optional (a list of strings;
blanks and duplicates dropped). The slug comes from the title; a title already
in use gets a distinct slug (`how-to-train-your-dragon-2`).

### `PUT /api/articles/:slug` — auth required, author only

Send only what changes: any of `title`, `description`, `body`, `tagList`.
Changing the title changes the slug — use the returned one. Omitting `tagList`
keeps the tags; `[]` removes them all; `null` is `422`. `updatedAt` moves
forward. Someone else's article is `403`.

### `DELETE /api/articles/:slug` — auth required, author only

`204`, no body. Its comments and favorites go with it.

---

## Favorites

### `POST /api/articles/:slug/favorite` — auth required
### `DELETE /api/articles/:slug/favorite` — auth required

Favorite or unfavorite; returns `{ "article": … }` with `favorited` and
`favoritesCount` updated. Both are idempotent.

---

## Comments

### `GET /api/articles/:slug/comments` — auth optional

`{ "comments": [ … ] }`, newest first, all of them.

### `POST /api/articles/:slug/comments` — auth required

```json
→ { "comment": { "body": "His name was my name too." } }
201 { "comment": { "id": 154, … } }
```

### `DELETE /api/articles/:slug/comments/:id` — auth required, comment author only

`204`, no body. `404` `{"errors":{"comment":["not found"]}}` if the article has
no such comment; `403` if it isn't yours.

---

## Tags

### `GET /api/tags`

```json
{ "tags": ["javascript", "webdev", "css", "…"] }
```

Every tag in use, most used first. The seed has 15; `javascript` alone spans
three pages of 10, and `security` has a single article.
