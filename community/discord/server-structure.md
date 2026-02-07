# Godel Discord Server Structure

**Version:** 1.0  
**Server URL:** https://discord.gg/godel  
**Last Updated:** 2026-02-06

---

## Server Overview

The official Godel community Discord server for developers, users, and contributors to connect, share, and get support.

**Server Name:** Godel Community  
**Server Icon:** Godel logo (animated)  
**Verification Level:** Medium (email verified)  
**Content Filter:** Scan messages from all members  

---

## Channel Structure

### Welcome Category

```
┌─────────────────────────────────────────────────────────┐
│  📋 Welcome                                               │
│  ├── 📌 #rules         - Server rules and guidelines    │
│  ├── 🎉 #announcements - Official announcements         │
│  ├── 👋 #introductions - Introduce yourself             │
│  └── 📚 #start-here    - Getting started guide          │
└─────────────────────────────────────────────────────────┘
```

**#rules:**
- Be respectful and inclusive
- No spam or self-promotion
- Use appropriate channels
- Keep discussions on-topic
- No piracy or illegal content
- Follow Discord TOS

**#start-here pinned message:**
```
Welcome to Godel! 🎉

1. Read the #rules
2. Introduce yourself in #introductions
3. Choose your roles in #roles
4. Ask questions in #help
5. Share your projects in #showcase

Need help? Tag @Moderator or @Community Helper
```

### Community Category

```
┌─────────────────────────────────────────────────────────┐
│  💬 Community                                             │
│  ├── 💭 #general       - General chat                   │
│  ├── 🎨 #showcase      - Share your projects            │
│  ├── 🤝 #collaborate   - Find collaborators             │
│  └── 🎊 #celebrations  - Wins and milestones            │
└─────────────────────────────────────────────────────────┘
```

### Support Category

```
┌─────────────────────────────────────────────────────────┐
│  🆘 Support                                               │
│  ├── ❓ #help          - General questions              │
│  ├── 🐛 #bugs          - Bug reports                    │
│  ├── 💡 #features      - Feature requests               │
│  └── 📖 #docs-feedback - Documentation feedback         │
└─────────────────────────────────────────────────────────┘
```

### Development Category

```
┌─────────────────────────────────────────────────────────┐
│  🛠️ Development                                           │
│  ├── 💻 #dev-general   - Development chat               │
│  ├── 🧠 #architecture  - Architecture discussions       │
│  ├── 🔌 #integrations  - Integration help               │
│  └── 🧪 #beta-testing  - Beta features discussion       │
└─────────────────────────────────────────────────────────┘
```

### Events Category

```
┌─────────────────────────────────────────────────────────┐
│  📅 Events                                                │
│  ├── 📢 #office-hours  - Office hours announcements     │
│  ├── 🎤 #ama           - AMA sessions                   │
│  └── 📊 #community-vote - Community polls               │
└─────────────────────────────────────────────────────────┘
```

### Resources Category

```
┌─────────────────────────────────────────────────────────┐
│  📚 Resources                                             │
│  ├── 🔗 #resources     - Useful links and tools         │
│  ├── 📝 #tutorials     - Community tutorials            │
│  └── 💼 #jobs          - Job postings                   │
└─────────────────────────────────────────────────────────┘
```

### Voice Channels

```
┌─────────────────────────────────────────────────────────┐
│  🔊 Voice Channels                                        │
│  ├── 🗣️ General Voice                                   │
│  ├── 👥 Meeting Room 1 (5 max)                          │
│  ├── 👥 Meeting Room 2 (5 max)                          │
│  └── 📹 Stage (Events)                                  │
└─────────────────────────────────────────────────────────┘
```

---

## Roles & Permissions

### Staff Roles

| Role | Color | Permissions | Mentionable |
|------|-------|-------------|-------------|
| @Admin | 🔴 Red | All | No |
| @Moderator | 🟡 Yellow | Manage messages, kick, mute | Yes |
| @Community Manager | 🟢 Green | Manage events, channels | Yes |
| @DevRel | 🔵 Blue | Pin messages, slow mode | Yes |

### Member Roles

| Role | How to Get | Benefits |
|------|------------|----------|
| @Member | Auto on join | Basic access |
| @Contributor | PR merged | Special badge, dev channels |
| @Early Adopter | Joined before v2.0 | Exclusive role |
| @Helper | Help 50+ users | @Community Helper mention |
| @Sponsor | GitHub Sponsor | Sponsor channel access |

### Notification Roles (Self-Assignable)

| Role | Use |
|------|-----|
| @📢 Announcements | Major updates |
| @🚀 Releases | New releases |
| @📅 Events | Office hours, AMAs |
| @💼 Jobs | Job postings |
| @🧪 Beta Tester | Beta access |

---

## Bot Configuration

### Carl-bot (Reaction Roles)

**Channel:** #roles

```
📢 Get notified about:
🚀 New releases
📅 Community events
💼 Job opportunities
🧪 Beta testing

👋 I am a:
💻 Developer
🏢 Company/User
🎨 Designer
📝 Technical Writer
```

### Dyno (Moderation)

**Auto-Mod Settings:**
- Spam detection: 5 msgs/5 sec
- Invite blocking: Non-staff only
- Link filtering: Untrusted domains
- Word filter: Profanity filter enabled

**Commands:**
- `?warn @user [reason]`
- `?mute @user [duration]`
- `?kick @user [reason]`
- `?ban @user [reason]`

### Godel Bot (Custom)

**Features:**
- `/help` - Link to documentation
- `/ticket` - Create support ticket
- `/faq [query]` - Search FAQ
- `/docs [topic]` - Link to docs

---

## Event Templates

### Office Hours Event

```
🎤 Godel Office Hours - [Topic]

📅 Date: [Date]
⏰ Time: [Time] UTC
📍 Location: #stage channel

🎯 Topics:
• [Topic 1]
• [Topic 2]
• [Topic 3]

❓ Submit questions: https://godel.dev/office-hours

🎥 Recording will be available after
```

### AMA Event

```
🌟 AMA with [Name] - [Title]

[Host] will be answering your questions about [topic]!

📅 [Date] at [Time] UTC
📍 #stage channel

👤 About [Name]:
[Bio]

🎤 Submit questions early in #ama-questions
🔔 React with 🎉 to get notified
```

---

## Moderation Guidelines

### Strike System

| Strikes | Action | Duration |
|---------|--------|----------|
| 1 | Warning | Permanent record |
| 2 | Mute | 24 hours |
| 3 | Kick | Rejoin allowed |
| 4 | Ban | Appeal after 30 days |

### Common Violations

1. **Spam:** 3+ off-topic messages in short succession → Mute
2. **Self-promotion:** Unsolicited product/service links → Warning
3. **Toxicity:** Personal attacks, harassment → Immediate ban
4. **Off-topic:** Repeated wrong channel usage → Direction + warning
5. **NSFW:** Any inappropriate content → Immediate ban

### Moderator Actions Log

All actions logged in #mod-log:
```
[Timestamp] @ModName action @UserName
Reason: [Reason]
Duration: [If applicable]
Evidence: [Screenshot/link]
```

---

## Growth Targets

| Metric | Month 1 | Month 3 | Month 6 |
|--------|---------|---------|---------|
| Total Members | 500 | 2,000 | 5,000 |
| Weekly Active | 150 | 600 | 1,500 |
| Daily Messages | 200 | 800 | 2,000 |
| Support Tickets | 50/week | 100/week | 200/week |

---

## Related Resources

- [Office Hours Format](../office-hours.md)
- [Community Guidelines](./community-guidelines.md)
- [Moderator Handbook](./moderator-handbook.md)
