# Godel Community Forum Structure

**Version:** 1.0  
**Forum URL:** https://community.godel.dev  
**Platform:** Discourse (self-hosted)  
**Last Updated:** 2026-02-06

---

## Forum Overview

The Godel community forum is the primary destination for long-form discussions, knowledge sharing, and permanent documentation of solutions.

**Categories:** 12 primary, 24 subcategories  
**Trust Levels:** 5 tiers with increasing permissions  
**Moderation:** Hybrid (automated + community)  

---

## Category Structure

### Announcements
**Description:** Official updates from the Godel team

| Subcategory | Purpose | Posting |
|-------------|---------|---------|
| 📢 Releases | Version announcements | Staff only |
| 🗓️ Roadmap | Feature roadmaps | Staff only |
| 🎉 News | Company/community news | Staff only |

**Settings:**
- Slow mode: 1 hour
- Auto-close: 30 days
- Pin limit: 5 topics

### Getting Help
**Description:** Support and troubleshooting

| Subcategory | Purpose | Examples |
|-------------|---------|----------|
| 🆘 Installation | Setup issues | Docker, npm, build errors |
| 🔧 Configuration | Config questions | .godelrc, env vars |
| 🐛 Bug Reports | Report bugs | Repro steps, logs |
| 💡 Feature Requests | Suggest features | RFC-style proposals |

**Template - Bug Report:**
```markdown
**Environment:**
- Godel Version: x.x.x
- Node.js Version: x.x.x
- OS: [e.g., macOS 14.2]
- Runtime: [D1/Bun/Node]

**Description:**
[Clear description of the bug]

**Steps to Reproduce:**
1. 
2. 
3. 

**Expected Behavior:**
[What should happen]

**Actual Behavior:**
[What actually happens]

**Logs/Code:**
```
[Error logs or code snippets]
```

**Additional Context:**
[Any other relevant information]
```

### Documentation
**Description:** Guides, tutorials, and examples

| Subcategory | Purpose | Posting |
|-------------|---------|---------|
| 📖 Tutorials | Step-by-step guides | Anyone |
| 🎓 Best Practices | Recommended patterns | Anyone |
| 📝 API Examples | Code examples | Anyone |
| 🔄 Migration Guides | Upgrading guides | Staff + verified |

### Development
**Description:** Technical discussions

| Subcategory | Purpose | Topics |
|-------------|---------|--------|
| 🏗️ Architecture | Design discussions | System design, patterns |
| 🔌 Integrations | Third-party integrations | Auth, databases, APIs |
| ⚡ Performance | Optimization | Benchmarks, tuning |
| 🔒 Security | Security discussions | Vulnerabilities, best practices |

### Show & Tell
**Description:** Share what you've built

| Subcategory | Purpose |
|-------------|---------|
| 🚀 Projects | Share Godel-powered projects |
| 🛠️ Tools | Developer tools and utilities |
| 🎨 UI Components | Reusable components |
| 💼 Case Studies | Production stories |

**Posting Guidelines:**
- Include screenshots or demos
- Describe what Godel features you used
- Share lessons learned
- Open source links encouraged

### Community
**Description:** General community topics

| Subcategory | Purpose |
|-------------|---------|
| 💬 General | Off-topic discussions |
| 🤝 Introductions | Meet the community |
| 💼 Jobs | Hiring and seeking |
| 🎯 Events | Meetups, conferences |

### Feedback
**Description:** Product feedback and surveys

| Subcategory | Purpose |
|-------------|---------|
| 👍 Praise | What you love |
| 👎 Critique | Constructive criticism |
| 📊 Surveys | Community polls |

### International
**Description:** Non-English discussions

| Subcategory | Language |
|-------------|----------|
| 🇨🇳 中文 | Chinese |
| 🇯🇵 日本語 | Japanese |
| 🇪🇸 Español | Spanish |
| 🇩🇪 Deutsch | German |
| 🇫🇷 Français | French |

---

## Trust Level System

### TL0: New User
- **Requirements:** Just created account
- **Restrictions:**
  - Cannot send PMs
  - Cannot post more than 1 topic per 5 minutes
  - Cannot post more than 3 replies per 10 minutes
  - Cannot edit posts after 24 hours

### TL1: Basic User
- **Requirements:**
  - Visited 5+ days
  - Read 30+ posts
  - Read 5+ topics
  - Spent 30+ minutes reading
- **New Abilities:**
  - Post images and attachments
  - Edit own posts
  - Flag posts

### TL2: Member
- **Requirements:**
  - Visited 15+ days
  - Cast 1+ likes
  - Received 1+ like
  - Replied to 3+ topics
  - Read 100+ posts
  - Read 20+ topics
  - Spent 1+ hour reading
- **New Abilities:**
  - Create polls
  - Send PMs
  - Invite users
  - Wiki posts (make own posts wiki)

### TL3: Regular
- **Requirements:** (Last 100 days)
  - Visited 50%+ of days
  - Replied to 10+ topics
  - Viewed 25%+ of topics (max 500)
  - Read 25%+ of posts (max 20k)
  - Received 20+ likes
  - Gave 30+ likes
  - Not suspended
- **New Abilities:**
  - Recategorize/rename topics
  - Access private "lounge" category
  - Daily like limit increased

### TL4: Leader
- **Requirements:** Manually granted by staff
- **Abilities:**
  - Edit all posts
  - Pin/unpin topics
  - Close topics
  - Archive topics
  - Make topics unlisted
  - Split/merge topics
  - Daily like limit maxed

---

## Moderation System

### Automated Moderation

**Akismet:** Spam detection on all posts

**Rate Limits:**
- New users: 1 topic / 5 min, 3 replies / 10 min
- Basic users: 2 topics / 5 min, 5 replies / 5 min
- Members+: 4 topics / 5 min, 10 replies / 5 min

**Flag Thresholds:**
- 3 flags → Hidden from public
- 5 flags → Moderator review required
- Staff can restore flagged content

### Community Moderation

**Flags Available:**
- 🚩 Off-topic
- 🚩 Inappropriate
- 🚩 Spam
- 🚩 Something else

**Trusted User Actions:**
- Auto-hide posts with 3+ flags
- Prevent flags on same post by same user
- Notify moderators of disputes

### Staff Moderation

**Moderator Tools:**
- Post history review
- User action logs
- IP address lookup
- Bulk actions on topics
- User suspension/banning

---

## Gamification

### Badges

| Badge | Criteria | Description |
|-------|----------|-------------|
| 🌱 First Steps | Create first post | Welcome to the community! |
| 📚 Reader | Read 100 posts | Well-read member |
| 💬 Conversationalist | 100 replies | Loves to discuss |
| ⭐ Helpful | 50 solutions marked | Community helper |
| 🏆 Expert | 1000 replies + 100 solutions | Power user |
| 🔧 Contributor | PR merged | Code contributor |
| 🎤 Speaker | Attend 5 office hours | Active participant |
| 📝 Author | Create 10 wiki topics | Knowledge sharer |

### Leaderboards

**Weekly:**
- Top Solutions Given
- Most Likes Received
- Most Active Users

**Monthly:**
- Rising Stars (new contributors)
- Topic Creators
- Helpful Users

**All Time:**
- Top Contributors
- Most Solutions
- Longest Active Members

---

## Content Quality Guidelines

### Encouraged
- ✅ Search before posting
- ✅ Use descriptive titles
- ✅ Include code examples
- ✅ Mark solutions as accepted
- ✅ Update outdated posts
- ✅ Be respectful and helpful

### Discouraged
- ❌ Cross-posting same question
- ❌ "+1" or "me too" replies
- ❌ Posting screenshots of text
- ❌ Bumping old topics
- ❌ Off-topic tangents
- ❌ Self-promotion without context

---

## Integration

### Discord Bridge
- Forum posts → #forum-feed channel
- New topics announced in Discord
- Discord reactions synced to forum likes

### GitHub Integration
- New releases auto-posted
- Issue references link back
- PR mentions in #development

### Documentation
- Forum solutions can become docs
- Two-way link between forum and docs site

---

## Analytics & Growth

### Key Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Daily Active Users | 10% of total | Google Analytics |
| Topic to Solution Rate | 80% | Forum data |
| Average Time to Solution | < 48 hours | Forum data |
| New Topics/Day | 10+ | Forum data |
| User Retention (30d) | 40% | Cohort analysis |

### Monthly Reports

**Published in #announcements:**
- New user growth
- Top contributors
- Popular topics
- Community health score
- Upcoming initiatives

---

## Related Resources

- [Discord Server](../discord/server-structure.md)
- [Office Hours](../office-hours.md)
- [Support SLA](../../docs/maintenance/triage-process.md)
