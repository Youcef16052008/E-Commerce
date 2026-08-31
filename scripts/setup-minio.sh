#!/usr/bin/env bash
#
# Mise en place d'un stockage objet MinIO LOCAL pour la démo Biblio.
# - Télécharge minio + mc (si absents) dans ./storage-bin
# - Lance le serveur (port 9000 API, 9001 console)
# - Crée le bucket `biblio`, un utilisateur applicatif dédié et sa policy
# - Seed les produits, génère les e-books et les upload (file_url mappés)
#
# Usage : bash scripts/setup-minio.sh
#
# Variables optionnelles :
#   MINIO_ROOT_USER / MINIO_ROOT_PASSWORD : compte root (défaut minioadmin/minioadmin)
#   MINIO_APP_USER / MINIO_APP_PASSWORD   : utilisateur applicatif (défaut biblioapp/biblioapp-secret)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BIN_DIR="$ROOT_DIR/storage-bin"
DATA_DIR="$ROOT_DIR/storage-data"
BUCKET="${STORAGE_BUCKET:-biblio}"
MINIO_USER="${MINIO_ROOT_USER:-minioadmin}"
MINIO_PASS="${MINIO_ROOT_PASSWORD:-minioadmin}"
APP_USER="${MINIO_APP_USER:-biblioapp}"
APP_PASS="${MINIO_APP_PASSWORD:-biblioapp-secret}"
ENDPOINT="http://127.0.0.1:9000"

mkdir -p "$BIN_DIR" "$DATA_DIR"

# --- 1. Binaires -------------------------------------------------------------
download() {
  local url="$1" dest="$2"
  echo "→ Téléchargement de $(basename "$dest")…"
  curl -fL --retry 3 -o "$dest" "$url"
  chmod +x "$dest"
}
if [ ! -x "$BIN_DIR/minio" ]; then
  download "https://dl.min.io/server/minio/release/linux-amd64/minio" "$BIN_DIR/minio"
fi
if [ ! -x "$BIN_DIR/mc" ]; then
  download "https://dl.min.io/client/mc/release/linux-amd64/mc" "$BIN_DIR/mc"
fi
echo "✓ Binaires prêts ($($BIN_DIR/minio --version | head -1))"

# --- 2. Serveur ---------------------------------------------------------------
if ! curl -sf --max-time 2 "$ENDPOINT/minio/health/live" >/dev/null 2>&1; then
  echo "→ Démarrage de MinIO (API :9000, console :9001)…"
  MINIO_ROOT_USER="$MINIO_USER" MINIO_ROOT_PASSWORD="$MINIO_PASS" \
    nohup "$BIN_DIR/minio" server "$DATA_DIR" --address ":9000" --console-address ":9001" \
    >"$BIN_DIR/minio.log" 2>&1 &
  for _ in $(seq 1 30); do
    if curl -sf --max-time 2 "$ENDPOINT/minio/health/live" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  curl -sf --max-time 3 "$ENDPOINT/minio/health/live" >/dev/null || {
    echo "✗ MinIO n'a pas démarré (voir $BIN_DIR/minio.log)."
    exit 1
  }
fi
echo "✓ MinIO en ligne sur $ENDPOINT"

# --- 3. Bucket + utilisateur applicatif ---------------------------------------
export MC_HOST_local="http://$MINIO_USER:$MINIO_PASS@127.0.0.1:9000"
"$BIN_DIR/mc" alias set local "$ENDPOINT" "$MINIO_USER" "$MINIO_PASS" >/dev/null
"$BIN_DIR/mc" mb --ignore-existing "local/$BUCKET" >/dev/null
echo "✓ Bucket $BUCKET prêt"

# Utilisateur applicatif (création idempotente)
if ! "$BIN_DIR/mc" admin user info "local/$APP_USER" >/dev/null 2>&1; then
  "$BIN_DIR/mc" admin user add "local/$APP_USER" "$APP_PASS" >/dev/null
  echo "✓ Utilisateur applicatif $APP_USER créé"
else
  echo "✓ Utilisateur applicatif $APP_USER existant"
fi

# Policy : lecture/écriture sur le bucket des e-books
cat >"$BIN_DIR/biblio-rw.json" <<'JSON'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": ["arn:aws:s3:::BUCKET_PLACEHOLDER/*"]
    },
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": ["arn:aws:s3:::BUCKET_PLACEHOLDER"]
    }
  ]
}
JSON
sed -i "s/BUCKET_PLACEHOLDER/$BUCKET/g" "$BIN_DIR/biblio-rw.json"
"$BIN_DIR/mc" admin policy create "local" biblio-rw "$BIN_DIR/biblio-rw.json" >/dev/null 2>&1 || \
  "$BIN_DIR/mc" admin policy create "local" biblio-rw "$BIN_DIR/biblio-rw.json" >/dev/null
"$BIN_DIR/mc" admin policy attach "local" biblio-rw --user "$APP_USER" >/dev/null
echo "✓ Policy biblio-rw attachée à $APP_USER"

# --- 4. Données ---------------------------------------------------------------
npm run seed:products
npm run books:generate
npm run books:upload

echo
echo "────────────────────────────────────────────────────────────"
echo "MinIO local prêt. À ajouter dans .env :"
echo "STORAGE_ENDPOINT=$ENDPOINT"
echo "STORAGE_BUCKET=$BUCKET"
echo "STORAGE_ACCESS_KEY_ID=$APP_USER"
echo "STORAGE_SECRET_ACCESS_KEY=$APP_PASS"
echo "STORAGE_REGION=us-east-1"
echo "STORAGE_FORCE_PATH_STYLE=true"
echo "Console : http://127.0.0.1:9001 (root : $MINIO_USER)"
echo "────────────────────────────────────────────────────────────"
