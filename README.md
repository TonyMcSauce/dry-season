# Dry Season

A small, good looking web app that estimates when your body will be clear of alcohol after a night out. Log your drinks (Botswana favourites are built in), set when you started and stopped, and watch the glass drain as the countdown runs.

Everything runs in the browser. Nothing leaves your phone: your tab, settings and past nights are stored in the browser's local storage.

## Files

| File | What it does |
| --- | --- |
| `index.html` | The whole app: layout, styles and logic |
| `manifest.webmanifest` | Lets iPhone and Android install it like an app |
| `sw.js` | Makes it work offline after the first visit |
| `icons/` | Home screen icons |

## Put it on GitHub Pages

1. Create a new public repository on GitHub, for example `dry-season`.
2. Upload every file in this folder (keep the `icons` folder as it is). On the repository page choose **Add file > Upload files**, drag them in, then **Commit changes**.
3. Open **Settings > Pages**. Under **Build and deployment**, set **Source** to *Deploy from a branch*, pick `main` and `/ (root)`, then **Save**.
4. Wait a minute. Your site appears at `https://<your-username>.github.io/dry-season/`.

### GitLab Pages instead

Add this file as `.gitlab-ci.yml` next to `index.html`, push, and the site appears at `https://<your-username>.gitlab.io/dry-season/`:

```yaml
pages:
  stage: deploy
  script:
    - mkdir .public && cp -r index.html manifest.webmanifest sw.js icons .public
    - mv .public public
  artifacts:
    paths:
      - public
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
```

## Add it to your iPhone home screen

1. Open the site in **Safari**.
2. Tap the **Share** button, then **Add to Home Screen**.
3. Tap **Add**. It now opens full screen with its own icon and works offline.

## How the estimate works

* Grams of alcohol per drink = millilitres x (ABV / 100) x 0.789, multiplied by how many you had and how much of each was yours.
* Drinks are spread evenly between your start and stop times, then absorbed gradually (half absorbed roughly every 15 minutes).
* Blood alcohol uses the Widmark formula: grams / (body water factor x weight in kg x 10), with 0.68 for a male body and 0.55 for a female body.
* Your body removes a steady amount per hour. 0.015% per hour is the default, and you can adjust it between 0.010% and 0.020% under **Your body**.
* One standard drink is counted as 10 g of pure alcohol.

### Built in drinks

| Drink | ABV | Default size |
| --- | --- | --- |
| St Louis Lager | 3.5% | 340 ml |
| St Louis Export | 4.7% | 340 ml |
| Carling Black Label | 5.5% | 750 ml quart |
| Castle Lager | 5.0% | 340 ml |
| Castle Lite | 4.0% | 340 ml |
| Lion Lager | 5.0% | 340 ml |
| Chibuku | 3.5% (rises as it ferments) | 1 litre |
| Windhoek Lager | 4.0% | 340 ml |
| Windhoek Draught | 4.0% | 440 ml |
| Hansa Pilsener | 4.2% | 340 ml |
| Heineken | 5.0% | 330 ml |
| Savanna Dry | 6.0% | 330 ml |
| Brutal Fruit | 4.5% (varies by flavour) | 275 ml |

Strengths change from time to time, so every drink lets you edit the ABV before adding it. To change the defaults, edit the `DRINKS` list near the top of the script in `index.html`.

## Important

This is an estimate for fun and awareness, not a breathalyser. Food, health, medication and individual metabolism all change the real result. Never use it to decide whether you can drive.

## Make it yours

* Change the footer line in `index.html` to whatever you like.
* After changing files, bump `CACHE = 'dry-season-v1'` in `sw.js` to `v2` so installed copies pick up the update.
