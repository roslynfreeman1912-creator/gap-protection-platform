# DER TEUFEL - Deployment Guide for Hostinger

## Pre-Deployment Checklist

Before deploying, ensure the project is built:

```bash
npm run build
```

This creates the `dist/` folder with production-ready files.

---

## Option 1: Hostinger Business/Cloud Hosting (Recommended - Easy)

### Requirements
- Hostinger Business or Cloud hosting plan
- GitHub account

### Steps

1. **Push project to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/der-teufel.git
   git push -u origin main
   ```

2. **Login to Hostinger hPanel**
   - Go to [hpanel.hostinger.com](https://hpanel.hostinger.com)

3. **Deploy Node.js App**
   - Click **"Node.js Apps"** in the sidebar
   - Click **"Connect GitHub"** and authorize
   - Select your repository

4. **Configure Build Settings**
   - Build command: `npm run build`
   - Start command: `npm run start`
   - Node.js version: `20` (or `18`)

5. **Set Environment Variables**
   In hPanel, add these environment variables:
   ```
   NODE_ENV=production
   SESSION_SECRET=your-secure-random-string-here
   ```

6. **Click Deploy**
   - Hostinger will build and deploy automatically
   - You'll get a temporary subdomain like `yourapp.hostinger.site`

7. **Configure Custom Domain (Optional)**
   - In hPanel, go to Domain settings
   - Point your domain to the app

---

## Option 2: Hostinger VPS (Full Control)

### Requirements
- Hostinger VPS plan
- SSH access

### Step 1: Connect to VPS
```bash
ssh root@YOUR_VPS_IP
```

### Step 2: Install Node.js 20
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v && npm -v
```

### Step 3: Install PM2 (Process Manager)
```bash
sudo npm install -g pm2
```

### Step 4: Upload Project
```bash
# Create directory
sudo mkdir -p /var/www/der-teufel
cd /var/www/der-teufel

# Option A: Clone from GitHub
git clone https://github.com/YOUR_USERNAME/der-teufel.git .

# Option B: Upload via SCP (from your local machine)
scp -r ./* root@YOUR_VPS_IP:/var/www/der-teufel/
```

### Step 5: Install Dependencies & Build
```bash
cd /var/www/der-teufel
npm install
npm run build
```

### Step 6: Create Environment File
```bash
nano .env
```

Add:
```
NODE_ENV=production
SESSION_SECRET=your-secure-random-string-here
```

### Step 7: Start with PM2
```bash
pm2 start dist/index.cjs --name der-teufel
pm2 save
pm2 startup
```

### Step 8: Install & Configure Nginx
```bash
sudo apt install nginx -y
sudo nano /etc/nginx/sites-available/der-teufel
```

Add this configuration:
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    
    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # SSE support (for real-time scanning)
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/der-teufel /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Step 9: Install SSL Certificate
```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

### Step 10: Configure Firewall
```bash
sudo ufw allow 80
sudo ufw allow 443
sudo ufw allow 22
sudo ufw enable
```

---

## Useful PM2 Commands

```bash
# View running processes
pm2 list

# View logs
pm2 logs der-teufel

# Restart app
pm2 restart der-teufel

# Stop app
pm2 stop der-teufel

# Monitor resources
pm2 monit
```

---

## Troubleshooting

### App not starting
```bash
pm2 logs der-teufel --lines 50
```

### Port already in use
```bash
sudo lsof -i :5000
sudo kill -9 PID
```

### Nginx errors
```bash
sudo nginx -t
sudo tail -f /var/log/nginx/error.log
```

---

## Environment Variables Reference

| Variable | Description | Example |
|----------|-------------|---------|
| NODE_ENV | Environment mode | `production` |
| SESSION_SECRET | Session encryption key | `random-32-char-string` |
| PORT | Server port (optional) | `5000` |

---

## App Information

- **Default Port**: 5000
- **Build Command**: `npm run build`
- **Start Command**: `npm run start`
- **Node.js Version**: 18 or 20 recommended
