# SSL Certificates

## Dev local (chaque développeur)

Les fichiers `.pem` ne sont pas committés. Chaque dev génère son propre cert :

```bash
# 1. Installer mkcert (une seule fois)
mkcert -install

# 2. Générer le cert pour wstd.dev
cd /path/to/webstudio/https
mkcert wstd.dev "*.wstd.dev"

# 3. Copier les fichiers générés
cp wstd.dev+1.pem fullchain.pem
cp wstd.dev+1-key.pem privkey.pem

# 4. Régénérer haproxy.pem
cat fullchain.pem privkey.pem > haproxy.pem

# 5. Nettoyer
rm wstd.dev+1.pem wstd.dev+1-key.pem
```

Cert valide ~2 ans. `/etc/hosts` doit avoir :

```
127.0.0.1 wstd.dev vite.wstd.dev
```

---

# Admin only (prod — Let's Encrypt)

Based on this article https://dev.to/istarkov/fast-and-easy-way-to-setup-web-developer-certificates-450e

```bash
sudo rm -rf /tmp/certbot/
sudo rm -rf /tmp/letsencrypt/

mkdir -p /tmp/certbot/
mkdir -p /tmp/letsencrypt/

infisical login
# When running infisical init, select: Webstudio > webstudio
infisical init

CLOUDFLARE_API_KEY=$(infisical secrets get WSTD_DEV-CLOUDFLARE_ZONE_TOKEN --path='/CLI' --env=staging --plain)

# Create cloudflare.ini with proper formatting and permissions
echo "dns_cloudflare_api_token = ${CLOUDFLARE_API_KEY}" > /tmp/certbot/cloudflare.ini
chmod 600 /tmp/certbot/cloudflare.ini

docker run -it --rm --name certbot  \
-v "/tmp/letsencrypt/data:/etc/letsencrypt" \
-v "/tmp/certbot:/local/certbot" \
certbot/dns-cloudflare certonly \
--dns-cloudflare \
--dns-cloudflare-credentials /local/certbot/cloudflare.ini \
--agree-tos \
--noninteractive \
-m istarkov@gmail.com \
-d wstd.dev \
-d '*.wstd.dev'

sudo chown -R $USER:$(id -g) /tmp/letsencrypt

cp /tmp/letsencrypt/data/live/wstd.dev/fullchain.pem ./https/fullchain.pem
cp /tmp/letsencrypt/data/live/wstd.dev/privkey.pem ./https/privkey.pem

# Haproxy key
cd https
cat ./fullchain.pem ./privkey.pem > ./haproxy.pem
```
