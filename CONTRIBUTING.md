# Contributing to Exportify

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

### Prerequisites

- **CLI**: Python 3.13+, [uv](https://docs.astral.sh/uv/)
- **Web**: Node.js 18+, npm
- A [Spotify Developer](https://developer.spotify.com/dashboard) app (see [README](README.md) for setup)

### CLI App

```sh
git clone https://github.com/kumarsomeshunos/exportify.git
cd exportify
cp .env.example .env
# Edit .env with your Spotify Client ID
uv sync
uv run exportify
```

### Web App

```sh
cd web
cp .env.local.example .env.local
# Edit .env.local with your Spotify Client ID
npm install
npm run dev
```

The web app runs at `http://127.0.0.1:8888`.

## Making Changes

1. Fork the repository
2. Create a feature branch: `git checkout -b my-feature`
3. Make your changes
4. Test locally (both CLI and web if your change affects shared logic)
5. Commit with a clear message: `git commit -m "Add feature X"`
6. Push to your fork: `git push origin my-feature`
7. Open a Pull Request

## Guidelines

- Keep PRs focused — one feature or fix per PR
- Follow existing code style (Python: PEP 8, TypeScript: existing conventions)
- No credentials or secrets in code — use environment variables
- Test your changes before submitting

## Reporting Issues

Use [GitHub Issues](https://github.com/kumarsomeshunos/exportify/issues) with the provided templates for bugs and feature requests.

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Be kind and respectful.
