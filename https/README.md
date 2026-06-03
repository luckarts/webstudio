# SSL Certificates

> **Les certs `.pem` ne vivent PAS dans le repo.** Ils sont stockés hors arbre git
> (`~/.local/share/webstudio-certs/`) pour qu'aucun `git checkout`/changement de branche
> ne puisse les écraser. `haproxy.sh` les lit via la variable `WSTD_PEM_PATH`.

## Dev local (chaque développeur)

```bash
# 1. Installer mkcert (une seule fois)
mkcert -install

# 2. Générer les certs hors repo (individuels + combiné)
mkdir -p ~/.local/share/webstudio-certs
mkcert \
  -cert-file ~/.local/share/webstudio-certs/fullchain.pem \
  -key-file ~/.local/share/webstudio-certs/privkey.pem \
  wstd.dev "*.wstd.dev"

# 3. Construire haproxy.pem (cert + clé concaténés)
cat ~/.local/share/webstudio-certs/fullchain.pem \
    ~/.local/share/webstudio-certs/privkey.pem \
    > ~/.local/share/webstudio-certs/haproxy.pem
```

Lancer le proxy + Vite (depuis la racine du projet) :

```bash
export WSTD_PEM_PATH=~/.local/share/webstudio-certs/haproxy.pem
export WSTD_HTTPS_DIR=~/.local/share/webstudio-certs

# Terminal 1 — proxy
./https/haproxy.sh

# Terminal 2 — builder
cd apps/builder && pnpm dev
```

Astuce : ajoute les deux `export` à ton `~/.bashrc` une fois pour toutes.

### Alternative : garder le cert dans `https/` (legacy)

Si tu préfères l'ancien emplacement, génère dans `https/` puis utilise un **symlink**
vers le dossier hors repo (le symlink reste ignoré par git) :

```bash
ln -sf ~/.local/share/webstudio-certs/haproxy.pem https/haproxy.pem
```

Sans `WSTD_PEM_PATH`, `haproxy.sh` retombe sur `https/haproxy.pem` par défaut.

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
