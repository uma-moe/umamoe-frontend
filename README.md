# uma.moe

uma.moe is a companion website for **Umamusume: Pretty Derby**, focused on practical tools for players of the global version. It brings together database search, inheritance planning, release tracking, rankings, statistics, and account utilities in one place.

Visit the live site: [uma.moe](https://uma.moe)

![uma.moe](https://img.shields.io/badge/uma.moe-live-success)
![Angular](https://img.shields.io/badge/Angular-17-red)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## What It Does

uma.moe is built around the workflows players repeat often: finding useful parents, planning inheritance, checking upcoming content, comparing performance, and understanding account or club progress.

### Inheritance Database

Search community and account-linked inheritance records with filters for characters, factors, races, support cards, affinity, trainer IDs, and other practical borrowing criteria. The database is designed for narrowing down useful parents quickly rather than browsing raw records one by one.

### Lineage Planner

Plan full inheritance trees across parents and grandparents. The planner supports manual entries, saved veterans, bookmarks, imports, exports, and transfer flows from the database so players can move from search to planning without rebuilding the same information.

### Timeline

Track expected global release timing for characters, support cards, banners, events, campaigns, and major updates. The timeline is built for planning ahead and comparing future content at a glance.

### Tierlists, Rankings, and Statistics

Explore precomputed rankings, trainer leaderboards, circle activity, and statistics pages that summarize game data into usable comparisons. These pages are meant to answer questions like what is popular, what is performing well, and how progress changes over time.

### Account Tools

Optional accounts let players link game data, manage saved veterans, bookmark database entries, view profiles, and keep useful planning state across sessions. Most browsing tools remain useful without an account.

### Cookie and Privacy Controls

The site includes a cookie consent flow for optional categories such as analytics and advertising. Google Analytics uses Consent Mode v2 with denied defaults, so analytics cookies and full reporting only run after analytics consent is granted.

## Design Goals

- Make daily Umamusume planning faster and less repetitive.
- Prefer searchable, filterable tools over static reference pages.
- Keep information dense enough for experienced players while staying usable on mobile.
- Support both anonymous browsing and account-backed workflows.

## Project Status

This repository contains the Angular frontend for the live uma.moe site. It is not packaged as a turnkey self-hosted release: the production site also depends on backend services, data pipelines, deployment secrets, generated assets, and operational infrastructure that are managed alongside the project.

The codebase is still useful for understanding and contributing to the frontend, but the README intentionally describes the product rather than presenting this as a generic installable application.

## Tech Snapshot

- Angular 17 frontend
- TypeScript
- Angular Material
- SCSS styling
- Route-level lazy loading
- Precomputed static datasets for heavier pages
- GitHub Actions based deployment for the hosted site

## Related Systems

- Backend API for accounts, profiles, rankings, circles, bookmarks, and database data
- Resource/data pipeline for extracted and generated game data
- Static asset generation for precomputed views and optimized media

## Disclaimer

uma.moe is an unofficial fan project and is not affiliated with Cygames or the official Umamusume: Pretty Derby publishers.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

## Acknowledgments

Thanks to the Umamusume community for data, testing, feedback, and all the tiny edge cases that make planning tools worth building.
