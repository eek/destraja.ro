#!/bin/bash
# Comanda forțată a cheii destraja_archive pe NAS (eek@eek-nas.eek.ro, ~/.ssh/authorized_keys): arhiva documentelor din
# /storage/backups/destraja-documente (scripts/straja-documente.mjs --arhiva). Cheia poate doar atât:
#   verify        sha256 pentru căile primite pe stdin (separate prin NUL), relative la arhivă; fără „..” și fără căi absolute
#   put-manifest  stdin devine manifest.jsonl (singurul fișier care se rescrie, prin redenumire)
#   put-changes   stdin devine schimbari.json
#   altceva       rsync prin rrsync, limitat la arhivă, fără ștergeri (-no-del) și fără suprascrieri (-no-overwrite, adică
#                 --ignore-existing impus de NAS); instantaneele zilnice ZFS (install-documente-nas.sh) păstrează și ele fiecare zi
# Instalat de scripts/vm/install-documente-nas.sh în ~/bin/destraja-documente-ssh.
DIR=/storage/backups/destraja-documente
case "$SSH_ORIGINAL_COMMAND" in
  verify)
    cd "$DIR" || exit 1
    while IFS= read -r -d '' p; do
      case "$p" in
        /* | *..*) echo "refuz: $p" >&2 ;;
        *) [ -f "$p" ] && sha256sum -- "$p" || echo "lipsește: $p" >&2 ;;
      esac
    done
    ;;
  put-manifest)
    cat > "$DIR/.manifest.tmp" && mv -f "$DIR/.manifest.tmp" "$DIR/manifest.jsonl"
    ;;
  put-changes)
    cat > "$DIR/.schimbari.tmp" && mv -f "$DIR/.schimbari.tmp" "$DIR/schimbari.json"
    ;;
  *)
    exec /usr/bin/rrsync -no-del -no-overwrite "$DIR"
    ;;
esac
