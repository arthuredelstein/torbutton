#!/bin/bash -e

# This var comes from the TBB locale list.
# XXX: Find some way to keep this, tor-launcher, and Tor Browser in sync
BUNDLE_LOCALES="ar ca cs da de el es-AR es-ES fa fr ga-IE he hu id is it ja ka ko lt nb-NO mk ms nl pl pt-BR ro ru sv-SE th tr vi zh-CN zh-TW"

# XXX: Basque (eu) by request in #10687.
# This is not used for official builds, but should remain so Basque XPIs can be
# built independently. We can do that for other languages too, if anyone
# requests it and translations are available.
# XXX: Adding bn-BD as well as we don't ship that locale ourselves due to bug
# 26498 and #29257. Others might want to fix, build, and use it, though.
BUNDLE_LOCALES="$BUNDLE_LOCALES eu bn-BD"

LOCALE_DIR=./chrome/locale

# FILEMAP is an array of "localeFile:translationBranch" strings.
FILEMAP=( "aboutDialog.dtd:torbutton-aboutdialogdtd"
          "aboutTor.dtd:abouttor-homepage"
          "aboutTBUpdate.dtd:torbutton-abouttbupdatedtd"
          "brand.dtd:torbutton-branddtd"
          "brand.properties:torbutton-brandproperties"
          "browserOnboarding.properties:torbutton-browseronboardingproperties"
          "torbutton.dtd:torbutton-torbuttondtd"
          "torbutton.properties:torbutton-torbuttonproperties"
         )

# Verify that the FILEMAP contains an entry for each Torbutton file.
FILES_ARE_MISSING=0
for DEST_PATH in $LOCALE_DIR/en-US/*.dtd $LOCALE_DIR/en-US/*.properties;
do
  IS_FILE_IN_MAP=0
  DEST_FILE=${DEST_PATH##*/}
  for KEYVAL in "${FILEMAP[@]}";
  do
    FILE="${KEYVAL%%:*}"
    if [ $FILE = $DEST_FILE ];
    then
      IS_FILE_IN_MAP=1
      break;
    fi
  done

  if [ $IS_FILE_IN_MAP -eq 0 -a $DEST_FILE != "onboarding.properties" ];
  then
    echo "Please add $DEST_FILE to FILEMAP." 1>&2
    FILES_ARE_MISSING=1
  fi
done

if [ $FILES_ARE_MISSING -ne 0 ];
then
  exit 1
fi

# Clone or update our translation repo.
if [ -d translation ];
then
  cd translation
  git fetch origin
  cd ..
else
  git clone https://git.torproject.org/translation.git
fi

# Update each translated file for each locale.
(
echo "Locales: $BUNDLE_LOCALES"
cd translation
for KEYVAL in "${FILEMAP[@]}"; do
  DEST_FILE="${KEYVAL%%:*}"
  BRANCH="${KEYVAL##*:}"
  echo "Updating ${DEST_FILE}..."
  git checkout -q "$BRANCH"
  git merge -q origin/"$BRANCH"
  for i in $BUNDLE_LOCALES;
  do
    mkdir -p ../$LOCALE_DIR/$i/
# Some file names are lowercase in Transifex.
    if [ -f $i/"$DEST_FILE" ]; then
      SRCFILE="$DEST_FILE"
    else
      SRCFILE="`echo $DEST_FILE | tr '[:upper:]' '[:lower:]'`"
    fi
# Use sed to work around a Transifex "double entity" issue.
    sed -e 's/\&amp;brandShortName;/\&brandShortName;/g'			\
        -e 's/\&amp;vendorShortName;/\&vendorShortName;/g'			\
        $i/"$SRCFILE" > ../$LOCALE_DIR/$i/"$DEST_FILE"
  done
done
)

# Autogenerate tor-browser-brand.ftl based on brand.properties
# and brand.dtd.
REGEX_ENTITY='<!ENTITY +([^" ]+) +"(.+)">';
for LOCALE in $BUNDLE_LOCALES;
do
  BRAND_PATH="$LOCALE_DIR/$LOCALE/brand.properties"
  BRAND_DTD_PATH="$LOCALE_DIR/$LOCALE/brand.dtd"
  TOR_BRAND_PATH="$(dirname "$BRAND_PATH")/branding/tor-browser-brand.ftl"

  BRAND_SHORTER_NAME="$(sed -n -e '/^brandShorterName/p' $BRAND_PATH | cut -d= -f2)"
  BRAND_SHORT_NAME="$(sed -n -e '/^brandShortName/p' $BRAND_PATH | cut -d= -f2)"
  BRAND_FULL_NAME="$(sed -n -e '/^brandFullName/p' $BRAND_PATH | cut -d= -f2)"
  BRAND_PRODUCT_NAME="$(sed -n -e '/^brandProductName/p' $BRAND_PATH | cut -d= -f2)"
  VENDOR_SHORT_NAME="$(sed -n -e '/^vendorShortName/p' $BRAND_PATH | cut -d= -f2)"
  TRADEMARK_INFO='{ " " }'
  if [[ "$(sed -n -e '/trademarkInfo/p' $BRAND_DTD_PATH)" =~ $REGEX_ENTITY ]]
  then
    # Replace some HTML entities (now just &quot;) for tor-browser-brand.ftl.
    TRADEMARK_INFO="${BASH_REMATCH[2]//&quot;/\'}"
  fi

  echo "# For Tor Browser, we use a new file (different than the brand.ftl file" > $TOR_BRAND_PATH
  echo "# that is used by Firefox) to avoid picking up the -brand-short-name values" >> $TOR_BRAND_PATH
  echo "# that Mozilla includes in the Firefox language packs." >> $TOR_BRAND_PATH
  echo "" >> $TOR_BRAND_PATH
  echo "-brand-shorter-name = $BRAND_SHORTER_NAME" >> $TOR_BRAND_PATH
  echo "-brand-short-name = $BRAND_SHORT_NAME" >> $TOR_BRAND_PATH
  echo "-brand-full-name = $BRAND_FULL_NAME" >> $TOR_BRAND_PATH
  echo "# This brand name can be used in messages where the product name needs to" >> $TOR_BRAND_PATH
  echo "# remain unchanged across different versions (Nightly, Beta, etc.)." >> $TOR_BRAND_PATH
  echo "-brand-product-name = $BRAND_PRODUCT_NAME" >> $TOR_BRAND_PATH
  echo "-vendor-short-name = $VENDOR_SHORT_NAME" >> $TOR_BRAND_PATH
  echo "trademarkInfo = $TRADEMARK_INFO" >> $TOR_BRAND_PATH
done
