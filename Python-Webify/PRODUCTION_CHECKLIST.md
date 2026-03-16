# 🚀 Production Deployment Checklist

## Pre-Deployment Security

### 1. Environment Variables ⚠️ CRITICAL
- [ ] Replace all API keys in `.env` with production keys
- [ ] Generate strong `SESSION_SECRET` (min 32 characters)
- [ ] Set correct `CORS_ORIGIN` to your domain
- [ ] Configure `DATABASE_URL` for production database
- [ ] Update company information in `.env`:
  - [ ] `COMPANY_NAME`
  - [ ] `COMPANY_EMAIL`
  - [ ] `COMPANY_PHONE`
  - [ ] `COMPANY_WEBSITE`

### 2. Database Setup
- [ ] Create production PostgreSQL database
- [ ] Run `npm run db:push` to create schema
- [ ] Or manually run `scripts/init_db.sql`
- [ ] Verify all tables created successfully
- [ ] Set up database backups

### 3. Security Headers
- [ ] Verify CSP headers in Express configuration
- [ ] Enable HSTS (Strict-Transport-Security)
- [ ] Configure X-Frame-Options
- [ ] Set X-Content-Type-Options
- [ ] Configure Referrer-Policy

### 4. SSL/TLS Configuration
- [ ] Obtain SSL certificate (Let's Encrypt recommended)
- [ ] Configure HTTPS in reverse proxy (Nginx/Apache)
- [ ] Force HTTPS redirects
- [ ] Test SSL configuration (ssllabs.com)

### 5. Rate Limiting
- [ ] Configure rate limiting in Express
- [ ] Set appropriate limits for API endpoints
- [ ] Configure IP-based rate limiting
- [ ] Test rate limiting functionality

### 6. Logging & Monitoring
- [ ] Configure log rotation
- [ ] Set up error monitoring (Sentry, etc.)
- [ ] Configure application monitoring
- [ ] Set up alerts for critical errors
- [ ] Test logging functionality

### 7. File Permissions
- [ ] Set correct permissions on `.env` (600)
- [ ] Restrict access to logs directory
- [ ] Secure reports directory
- [ ] Verify vuln directory is read-only

### 8. Dependencies
- [ ] Run `npm audit` and fix vulnerabilities
- [ ] Run `pip check` for Python dependencies
- [ ] Update all dependencies to latest secure versions
- [ ] Remove development dependencies from production

## Deployment Steps

### Option 1: Docker Deployment (Recommended)

```bash
# 1. Build Docker image
npm run docker:build

# 2. Configure environment
cp .env.example .env
# Edit .env with production values

# 3. Start services
npm run docker:up

# 4. Check logs
npm run docker:logs

# 5. Verify health
curl http://localhost:5000/api/health
```

### Option 2: Manual Deployment

```bash
# 1. Install dependencies
npm run setup

# 2. Build application
npm run build

# 3. Initialize database
npm run db:push

# 4. Start application
npm start
```

### Option 3: Hostinger Deployment

Follow instructions in `DEPLOYMENT.md`

## Post-Deployment Verification

### 1. Functionality Tests
- [ ] Test scanner functionality
- [ ] Verify PDF report generation
- [ ] Test WAF/Shield features (if using database)
- [ ] Verify file upload/download
- [ ] Test authentication (if enabled)

### 2. Security Tests
- [ ] Run security headers check
- [ ] Verify HTTPS is working
- [ ] Test rate limiting
- [ ] Verify CORS configuration
- [ ] Check for exposed sensitive files

### 3. Performance Tests
- [ ] Test application under load
- [ ] Verify database performance
- [ ] Check memory usage
- [ ] Monitor CPU usage
- [ ] Test concurrent scans

### 4. Monitoring Setup
- [ ] Configure uptime monitoring
- [ ] Set up error alerts
- [ ] Configure performance monitoring
- [ ] Set up log aggregation
- [ ] Test alert notifications

## Maintenance

### Daily
- [ ] Check application logs
- [ ] Monitor error rates
- [ ] Verify backups completed

### Weekly
- [ ] Review security logs
- [ ] Check disk space
- [ ] Review performance metrics
- [ ] Update vulnerability payloads

### Monthly
- [ ] Update dependencies
- [ ] Review and rotate API keys
- [ ] Security audit
- [ ] Performance optimization
- [ ] Database maintenance

## Rollback Plan

If deployment fails:

1. **Docker**: `docker-compose down && docker-compose up -d` (previous image)
2. **Manual**: Restore from backup
3. **Database**: Restore database backup
4. **Verify**: Run health checks

## Support Contacts

- Technical Support: [Your Email]
- Emergency Contact: [Your Phone]
- Documentation: README.md, DEPLOYMENT.md

## Notes

- Always test in staging environment first
- Keep backups of configuration files
- Document any custom changes
- Maintain deployment logs

---

**Last Updated**: 2026-03-16
**Version**: 1.0.0
