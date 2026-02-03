# Blog System Specification

## Overview

A static blog hosted on `blog.octatech.xyz` where articles are written in Markdown and automatically deployed when committed to the repository.

## Requirements

### Functional Requirements

1. **Markdown Authoring**
   - Articles written as `.md` files in a designated folder
   - Support for frontmatter (title, date, tags, description, author)
   - Support for images and code blocks with syntax highlighting

2. **Static Generation**
   - Build to static HTML on commit
   - Deploy automatically to GitHub Pages
   - Fast page loads (no server-side rendering needed)

3. **Blog Features**
   - Article listing page with pagination
   - Individual article pages with clean URLs (`/article-slug`)
   - Tag/category filtering
   - RSS feed generation
   - SEO meta tags (Open Graph, Twitter cards)

4. **Design**
   - Match the existing Octatech visual style (dark theme, indigo accents)
   - Responsive design
   - Navigation back to main site (octatech.xyz)

### Non-Functional Requirements

- Build time < 30 seconds for up to 100 articles
- Lighthouse score > 90 for performance
- Works without JavaScript (progressive enhancement)

## Technology

**Astro** - chosen for:
- Native Markdown support
- Static output (perfect for GitHub Pages)
- Fast builds
- Easy to integrate existing Tailwind styles

## File Structure

```
packages/blog/
├── src/
│   ├── content/
│   │   └── posts/
│   │       ├── my-first-article.md
│   │       └── another-article.md
│   ├── layouts/
│   │   ├── BaseLayout.astro
│   │   └── PostLayout.astro
│   ├── pages/
│   │   ├── index.astro          # Blog home / article list
│   │   ├── posts/[slug].astro   # Individual article
│   │   ├── tags/[tag].astro     # Articles by tag
│   │   └── rss.xml.js           # RSS feed
│   └── styles/
│       └── global.css
├── public/
│   └── images/                  # Blog images
├── astro.config.mjs
└── package.json
```

## Article Frontmatter Schema

```yaml
---
title: "Article Title"
description: "Brief description for SEO and previews"
date: 2025-01-15
tags: ["engineering", "cloud", "tutorial"]
author: "Galer"
draft: false
image: "/images/article-cover.jpg"  # Optional cover image
---
```

## Inputs

| Input | Description |
|-------|-------------|
| Markdown files | `.md` files in `src/content/posts/` |
| Images | Files in `public/images/` |
| Git push to main | Triggers deployment |

## Outputs

| Output | Description |
|--------|-------------|
| Static HTML | Built to `dist/` folder |
| RSS Feed | Available at `/rss.xml` |
| Sitemap | Available at `/sitemap.xml` |

## Success Criteria

1. **Article Creation**: Can create a new article by adding a `.md` file, committing, and seeing it live within 5 minutes
2. **Design Consistency**: Blog matches main site's visual style
3. **SEO**: Articles appear correctly when shared on social media (OG tags work)
4. **Navigation**: Users can easily navigate between blog and main site
5. **Performance**: Lighthouse performance score > 90

## Testing

| Test | Method |
|------|--------|
| Markdown rendering | Add article with various MD features (headers, code, images, links) |
| Frontmatter parsing | Verify title, date, tags display correctly |
| Build success | `npm run build` completes without errors |
| RSS validity | Validate RSS feed with W3C validator |
| Mobile responsive | Test on mobile viewport |
| Cross-linking | Verify links between blog and main site work |

## Deployment

1. On push to `main`, GitHub Action triggers
2. Action runs `npm run build` in `packages/blog/`
3. Built `dist/` folder deployed to GitHub Pages
4. `blog.octatech.xyz` CNAME configured to point to GitHub Pages

## Future Considerations

- Search functionality (could use Pagefind for static search)
- Newsletter signup integration
- View counts (would need analytics)
- Comments (could use Giscus for GitHub-based comments)
