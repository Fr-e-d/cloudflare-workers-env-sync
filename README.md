# Cloudflare Microservice Secrets

A centralized microservice for managing environment variables and shared secrets across all Cloudflare Workers in a project. Simplify configuration with environment-specific settings, enhanced security, and automated deployment. Set up any worker with a single command.

## 🔐 Overview

This microservice provides a central point for storing and distributing environment variables and secrets to all other cloudflare Workers within the project's ecosystem. It ensures consistency across different environments (development, staging, production) while maintaining the security of sensitive information.

It eliminates the need to manually configure shared variables and secrets across multiple Cloudflare Workers in the same ecosystem, saving time and reducing the risk of configuration errors or inconsistencies.

With this tool, you can set up secrets and variables for any worker in your project with a single command:  
`npm run apply-secrets:{environment}`

## 🌟 Features

- **Centralized configuration management**: A single source of truth for all variables and secrets  
- **Environment-specific configurations**: Separate settings for development, staging, and production  
- **Enhanced security**: Authentication via password and cryptographic signatures  
- **Protection against attacks**: Anti-replay mechanisms with nonce and timestamps  
- **Rate limiting protection**: Prevents brute force attacks
- **Automated deployment**: Script to automatically apply configurations to Workers  

## 🚀 Getting Started

### Quick Setup

Run our interactive setup wizard:

```bash
npm run wizard
```

This wizard will guide you through the entire setup process with step-by-step instructions.

### Manual Installation

Follow these steps to set up the Microservices Secrets Manager manually:

#### Step 1: Create a Cloudflare Account

If you don't already have a Cloudflare account:
1. Go to [https://dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)
2. Follow the registration process
3. Verify your email address

#### Step 2: Set Up a KV Namespace for Rate Limiting

The rate limiting feature requires a KV namespace:
1. Go to your Cloudflare dashboard
2. Navigate to "Workers & Pages" → "KV"
3. Click "Create namespace"
4. Name it `USER_RATE_LIMIT_KV`
5. Take note of the namespace ID (you'll need it later)

#### Step 3: Install Wrangler CLI

Wrangler is Cloudflare's command-line tool for managing Workers:

```bash
npm install -g wrangler
wrangler login
```

This will open a browser window to complete the authentication process.

#### Step 4: Configure wrangler.toml

Create or update the `wrangler.toml` file in your microservices-secrets-manager directory:

```toml
name = "microservices-secrets-manager"
main = "src/index.js"
compatibility_date = "2025-02-14"
node_compat = true

# Get your account_id by running: wrangler whoami
# Or find it in the Cloudflare dashboard under "Workers & Pages"
account_id = "your-account-id-here"

# KV Namespace binding for rate limiting
[[kv_namespaces]]
binding = "USER_RATE_LIMIT_KV"
id = "your-kv-namespace-id-here"

# Environment variables (non-sensitive)
[vars]
# Example variable for development environment
API_HOST_development = "https://api-dev.example.com"
# Example variable for staging environment
API_HOST_staging = "https://api-staging.example.com"
# Example variable for production environment
API_HOST_production = "https://api.example.com"
```

##### Finding Your Account ID

You can find your account ID by:
- Running `wrangler whoami` in your terminal
- Or in the Cloudflare dashboard, go to "Workers & Pages" and look for "Account ID" in the right sidebar

##### Adding Environment Variables

Add your environment variables to the `wrangler.toml` file following this pattern:
- For development: `VARIABLE_NAME_development = "value"`
- For staging: `VARIABLE_NAME_staging = "value"`
- For production: `VARIABLE_NAME_production = "value"`

#### Step 5: Add Secrets

For sensitive information, you need to add secrets using Wrangler CLI or the Cloudflare dashboard:

##### Using Wrangler CLI:

```bash
# For the development environment (default)
wrangler secret put SECRET_API_KEY_development

# For staging
wrangler secret put SECRET_API_KEY_staging --env staging

# For production
wrangler secret put SECRET_API_KEY_production --env production
```

##### Using Cloudflare Dashboard:

1. Go to your Cloudflare dashboard
2. Navigate to "Workers & Pages" → Find your worker → "Settings" → "Variables"
3. Click "Add variable" and select "Secret"
4. Name your secret following the pattern: `SECRET_{NAME}_{environment}`
5. Add the value and save

> ⚠️ **Important**: When adding variables through the Cloudflare dashboard UI, only add secrets (encrypted variables). Regular variables should be defined in the `wrangler.toml` file, as they will be overwritten during the next deployment if not defined there.

#### Step 6: Deploy the Worker

Deploy your Microservices Secrets Manager:

```bash
wrangler deploy
```

Your secrets manager should now be deployed! Take note of the URL provided after deployment (e.g., `https://microservices-secrets-manager.your-account.workers.dev`).

#### Step 7: Set Up the Master Password

This is a critical security step! You must set up a master password that will be used to authenticate all requests to the secrets manager:

```bash
wrangler secret put MASTER_PASSWORD
```

When prompted, enter a strong password (minimum 12 characters recommended, with a mix of letters, numbers, and special characters).
This password will be required whenever you run the `apply-secrets` command from any client microservice.

> ⚠️ **Important**: Keep this master password secure and share it only with authorized team members. Anyone with this password can access all your environment variables and secrets.

Your secrets manager is now fully operational and secured!

## 📋 Setting Up Worker Clients

Now, let's configure your other microservices (WORKER CLIENTS) to use the Secrets Manager:

### 1. Add setSecrets.js to Each Client

Create the directory structure if it doesn't exist:

```bash
mkdir -p src/configs
```

Add the `setSecrets.js` file to `src/configs/` in each client microservice, and update the `SECRETS_WORKER_URL` to point to your deployed worker:

```javascript
// In src/configs/setSecrets.js
const SECRETS_WORKER_URL = 'https://microservices-secrets-manager.your-account.workers.dev';
```

### 2. Update package.json in Each Client

Add these scripts to the `package.json` file of each client microservice:

```json
"scripts": {
  "apply-secrets": "node src/configs/setSecrets.js",
  "apply-secrets:dev": "node src/configs/setSecrets.js --env development",
  "apply-secrets:staging": "node src/configs/setSecrets.js --env staging",
  "apply-secrets:prod": "node src/configs/setSecrets.js --env production"
}
```

## 📲 Using the Secrets Manager

Now you can apply environment variables and secrets to any of your microservices with a single command:

```bash
# For development environment (default)
npm run apply-secrets

# For staging environment
npm run apply-secrets:staging

# For production environment
npm run apply-secrets:prod
```

> ⚠️ **Important**: Before applying secrets to a specific environment, make sure you've deployed your worker to that environment. For example, run `wrangler deploy --env staging` before running `npm run apply-secrets:staging`.


## 📝 Naming Convention

Variables and secrets follow a naming convention based on the environment:

# Regular variables
{VARIABLE_NAME}_{environment}

# Secrets (sensitive variables)
SECRET_{VARIABLE_NAME}_{environment}
```

Examples:
```
REST_API_URL_development
REST_API_URL_staging
REST_API_URL_production

SECRET_REST_API_KEY_development
SECRET_REST_API_KEY_staging
SECRET_REST_API_KEY_production
```

## 🔄 Recommended Development Workflow

1. Create a new microservice with Wrangler  
2. Install the client script as described above  
3. Run `npm run apply-secrets` to set up environment variables  
4. Develop your microservice using the configured variables  
5. Before deploying to staging/production, run `npm run apply-secrets:staging` or `npm run apply-secrets:prod`  

## 🔒 Security Best Practices

- **Never share** the master password in files, emails, or unsecured messages  
- The password should be securely communicated only to authorized team members  
- Regularly change the master password (recommended every 90 days)  
- All communications between the client script and the Worker are secured via HTTPS  
- Authentication uses HMAC-SHA256 signatures with replay attack protection  

## 📝 Maintenance

### Adding a New Variable or Secret

```bash
# For all environments
wrangler secret put SECRET_NEW_API_KEY_development
wrangler secret put SECRET_NEW_API_KEY_staging
wrangler secret put SECRET_NEW_API_KEY_production

# Or for a non-sensitive variable
wrangler var put NEW_FEATURE_FLAG_development --value "true"
wrangler var put NEW_FEATURE_FLAG_staging --value "true"
wrangler var put NEW_FEATURE_FLAG_production --value "false"
```

### Rotating the Master Password

```bash
wrangler secret put MASTER_PASSWORD
```

## ⚠️ Troubleshooting

| Issue | Solution |
|----------|----------|
| `Incorrect or unauthorized password` | Ensure you are using the correct master password |
| `Request expired` | Check that your system clock is synchronized |
| `Error configuring [variable]` | Verify that you have the necessary permissions for this Worker |
| `MASTER_PASSWORD not configured` | The master password has not been set in the Worker |
| `Rate limit exceeded` | Too many failed attempts. Wait for the specified time or reset the rate limit in KV |
| `Module not found: Error: Cannot find module './utils/crypto'` | Ensure you've created the crypto.js utility file |
| `TypeError: crypto.subtle is undefined` | This error occurs when running the Worker code locally; it's only available in the Cloudflare Workers environment |

## 🤝 Contribution

1. Fork the project  
2. Create your feature branch (`git checkout -b feature/amazing-feature`)  
3. Commit your changes (`git commit -m 'Add some amazing feature'`)  
4. Push to the branch (`git push origin feature/amazing-feature`)  
5. Open a Pull Request  

## 📜 License

This project is licensed under the [MIT](LICENSE) license.

## 👥 Team

- Fr-e-d - Lead Maintainer  

---

Developed with ❤️ by the [Fr-e-d] assited by AI : [Claude-3.7-sonnet from Anthropic](https://www.anthropic.com/news/claude-3-7-sonnet) within [Cursor AI](https://www.cursor.com/) (IDE)

