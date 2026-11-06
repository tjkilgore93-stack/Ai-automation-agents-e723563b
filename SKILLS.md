# Skills and Project Architecture

## Overview

This repository is organized as a multi-app project centered on the Hyperfy product ecosystem.

The current product split is:

- Landing app: Hyperfy marketing and product landing page
- Auth app: Next.js application with Supabase authentication and account flows
- Shared infra/docs: CI, deployment, documentation, and common configuration

## Repo Structure

```text
Ai-automation-agents/
├── apps/
│   ├── landing/
│   │   ├── app/
│   │   ├── components/
│   │   ├── public/
│   │   ├── styles/
│   │   ├── package.json
│   │   └── README.md
│   └── auth/
│       ├── app/
│       ├── components/
│       ├── lib/
│       ├── supabase/
│       ├── package.json
│       └── README.md
├── packages/
│   └── ui/              # optional shared components later
├── docs/
├── .github/
│   └── workflows/
├── README.md
├── package.json
├── .gitignore
└── SKILLS.md
```
