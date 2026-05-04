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
# Generate a secure JWT_SECRET with: openssl rand -base64 32
JWT_SECRET=your_generated_secret_here
GEMINI_API_KEY=your_google_ai_studio_api_key
```
*Note: `JWT_SECRET` is required for login security. `GEMINI_API_KEY` is for AI features.*

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

### SSL Troubleshooting (Common Errors)
- **Error 503 / Unauthorized:** 
    - **Check DNS:** Ensure your Domain "A" record points to your VPS IP. Delete any old **AAAA** records.
    - **Firewall:** Ensure ports 80 and 443 are open: `sudo ufw allow 'Nginx Full'`.
- **Certbot Failed to Authenticate:** 
    - Try the webroot method: `sudo certbot certonly --webroot -w /var/www/html -d yourdomain.com`.

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

---

## 8. Frequently Asked Questions

### Why is there no separate "Backend" folder?
This is a **Unified Application**. The backend (Express) and frontend (React) live in the same project. 
- `server.ts` is your entire backend.
- `src/` contains your frontend code.
- `npm run build` compiles the frontend into the `dist/` folder, which the backend then serves.

### Can I replace the Gemini API Key with Hostinger?
No. These are two different services:
- **Google Gemini API Key**: This is for the "AI Lucky Pick" feature (the AI brain). You get this from [Google AI Studio](https://aistudio.google.com/).
- **Hostinger**: This is your VPS provider (the hosting server). 
You need **both**: Hostinger to provide the server, and the Gemini Key for the AI functionality.

### PathError (Missing parameter name)
This error occurs because you are using **Express 5**. In Express 5, wildcard routes MUST be named.
- **Fixed syntax:** `app.get('(.*)', ...)` (Most compatible with Express 5 / path-to-regexp v8)

**I have applied this fix to `server.ts`.** If you still see the error:
1. **Pull the latest changes:** `git pull`
2. **Re-build the frontend:** `npm run build`
3. **CRITICAL: Clean up PM2.** You likely have duplicate or old processes running.
   ```bash
   # Kill everything to be safe
   pm2 stop all
   pm2 delete all
   
   # Restart fresh with the correct name
   npm install
   pm2 start "npx tsx server.ts" --name ababa-exchange
   ```
4. **Check logs again:** `pm2 logs ababa-exchange`

### 404 Handlers
I have added a standard 404 handler at the end of `server.ts`:
```ts
app.use((req, res) => {
  res.status(404).send("Not Found");
});
```
This catches any requests (like POST requests to unknown routes) that aren't handled by your API or the SPA fallback.

### 503 Server Error / AI Disabled
If you see a `503` error when using AI features (like Lucky Pick), it means the **Gemini API Key** is missing from your environment.
- Add `GEMINI_API_KEY=your_key_here` to your `.env` file.

### Architecture Note: Unified App vs `backend/` Folder
The **active** backend is the `server.ts` file in the root directory. It handles both API routes and serving the React frontend. The `backend/` folder is legacy and can be ignored.

