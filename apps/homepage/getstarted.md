## The easy way

Open Claude Code — or another coding agent — in an empty folder, and tell it what you want, for example:

> Write me a kanban board using Declare, here: https://github.com/davidtemkin/declarelang

> Write me a personal budgeting app using Declare, here: https://github.com/davidtemkin/declarelang

Provide any required permissions.

In 15–20 minutes you'll have your first Declare app. That's it.

## Or do it yourself

Cloning the repository gives you everything: the toolchain you build with, the docs and example apps, and Declare's own source to read. For a project of your own, install Declare as a dependency instead ([Embedding Declare in a project](https://github.com/davidtemkin/declarelang/blob/main/docs/operational/embedding.md)).

<!-- generated:setup-commands -->
```bash
git clone https://github.com/davidtemkin/declarelang.git && cd declarelang
```
Get the repository.

```bash
npm install
```
Install the toolchain's dependencies (TypeScript, esbuild, and the Chrome driver the checking tools run on). The clone ships prebuilt — no build step before first run. pnpm works too — the repo pre-approves esbuild's install script.

```bash
npm start
```
Start the dev server. It prints its address — http://127.0.0.1:8200/ unless that port is taken, in which case it says so and names the next (`PORT=8201 npm start`). Browse to any .declare file's URL under it and the server compiles and returns the running app.

Write a program to my-apps/hello.declare and browse to it under the server's address — http://127.0.0.1:8200/my-apps/hello.declare on the default port. The program URL is the app's address.
<!-- /generated:setup-commands -->

## Learning Declare

[**The Declare docs**](https://davidtemkin.github.io/declarelang/apps/docs/) are the place to start, and they come in four parts:

- **The guide**, in 31 chapters. It starts from first principles and covers each part of building an app, from layout, controls and data to motion, accessibility, touch and embedding. It also walks through a complete calendar app, and has a glossary and notes for people coming from other frameworks.
- **The language**, a page for each form the grammar accepts.
- **The types**, a page for each named vocabulary.
- **The class reference**, a page for every class with its members and live examples.
