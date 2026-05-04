# A-Baba Exchange - VPS Deployment Guide

This guide provides a step-by-step walkthrough to deploy the **A-Baba Exchange** full-stack application on a Linux VPS (Ubuntu 22.04/24.04 recommended).

This application is a **Unified Full-Stack App**:
- **Backend**: Express (Node.js) using `better-sqlite3`.
- **Frontend**: React + Vite (compiled to static assets).
- **Single Entry**: The same server serves the API and the static frontend.

---

## 1. Prerequisites
- A VPS with at least 1GB RAM.
- A domain name (recommended for SSL).
- SSH access to your server.

---

## 2. Server Setup

### Update System
```bash
sudo apt update && sudo apt upgrade -y
```

### Install Node.js
Recommended: Node.js 20 or 22 (supports native TypeScript stripping).
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

### Install PM2 (Process Manager)
```bash
sudo npm install -g pm2
```

---

## 3. Application Deployment

### Clone the Repository
```bash
git clone <your-repo-url>
cd a-baba-exchange
```

### Multi-App Configuration (IMPORTANT)
Since you have other apps running, you must use a unique port.
1. Create `.env`: `nano .env`
2. Set your port (e.g., 3000):
```env
PORT=3000
JWT_SECRET=your_secret_here
GEMINI_API_KEY=your_key_here
```

### Install Dependencies
```bash
npm install
```

### Configure Environment Variables
Create a `.env` file in the root directory:
```bash
nano .env
```
Copy and customize these values:
```env
PORT=3000
NODE_ENV=production
JWT_SECRET=generate_a_long_random_string_here
GEMINI_API_KEY=your_google_ai_studio_api_key
```
*Note: `JWT_SECRET` is used for login security. `GEMINI_API_KEY` is for AI Lucky Pick.*

### Build the Frontend
This compiles the React code into optimized assets in the `dist/` folder.
```bash
npm run build
```

---

## 4. Running the Application

### Start with PM2
We use `tsx` to run the TypeScript server directly.
```bash
pm2 start "npx tsx server.ts" --name ababa-exchange
```

### Enable Startup Persistence
Ensure the app starts if the server reboots:
```bash
pm2 save
pm2 startup
```
*(Copy and run the command provided by the `pm2 startup` output)*

---

## 5. Nginx Reverse Proxy (Optional but Recommended)

To serve your app on standard ports (80/443) and use your domain.

### Install Nginx
```bash
sudo apt install nginx -y
```

### Configure Nginx
```bash
sudo nano /etc/nginx/sites-available/ababa-exchange
```
Add this configuration (replace `yourdomain.com`):
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```
### Enable and Restart
```bash
sudo ln -s /etc/nginx/sites-available/ababa-exchange /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## 6. Secure with SSL (Certbot)

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

---

## 7. Maintenance

### Logs
To view server logs in real-time:
```bash
pm2 logs ababa-exchange
```

### Updates
When you update your code:
```bash
git pull
npm install
npm run build
pm2 restart ababa-exchange
```

### Database Persistence
The data is stored in `database.sqlite` in the root folder. 
**Important:** Back up this file regularly. If you delete it, all users and bets will be lost.
