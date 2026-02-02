# Publishing Dash to NPM

## Step 1: Login to NPM

```bash
npm login
```

Enter your:
- Username
- Password
- Email (this is displayed on your public profile)
- One-time password (if 2FA is enabled)

## Step 2: Publish

```bash
cd /Users/jasontang/clawd/projects/mission-control
npm publish --access public
```

## Package Details

- **Name**: `@davidkimai/dash`
- **Version**: 1.0.0
- **Main**: dist/index.js
- **Bin**: dash

## After Publishing

Install globally:
```bash
npm install -g @davidkimai/dash
```

Or use with npx:
```bash
npx @davidkimai/dash --help
```

## Verify Installation

```bash
dash --version
dash --help
```
