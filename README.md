# Dry Season

A small, good looking web app that estimates when your body will be clear of alcohol after a night out. Log your drinks (Botswana favourites are built in), set when you started and stopped, and watch the glass drain as the countdown runs.

## New in V2

* **Driving status.** A pill in the hero shows *Over the legal limit*, *Under the limit, still impaired* or *Clear, by this estimate*, with the time you should drop under the limit. The app never says you're safe to drive.
* **Driving soon?** Enter when you next need to drive or start a shift. A ticket tells you whether you're likely to be fully clear with an hour to spare, and, if you're still drinking, the latest time to stop at your current pace.
* **Blackout risk.** A Low, Raised or High rating from your projected peak, how fast your level is rising, how many drinks you've had in the last hour and whether you've eaten. A colour scale shows where you are now and where you'll peak.
* **Pacing nudges.** When the risk climbs, you get a suggested wait before your next drink, worked out so your peak stays under 0.15% and your pace stays around three drinks an hour or less.
* **Risk zones on the curve.** The chart is shaded by zone with the legal limit marked.
* **Food toggle.** *I ate a proper meal* slows absorption and lowers the peak.
* **Looking out for you.** Very high levels or very fast drinking bring up the signs of alcohol poisoning and tap to call buttons for Botswana's emergency numbers (ambulance 997, Medical Rescue 911, police 999).
* **Text a friend my status** shares where you're at and when you should be clear.

Everything runs in the browser. Nothing leaves your phone: your tab, settings and past nights are stored in the browser's local storage.

## Files

| File | What it does |
| --- | --- |
| `index.html` | Layout, styles and interface logic |
| `model.js` | The blood alcohol and risk maths, shared by the app and the tests |
| `tests/model.test.js` | Tests for the maths. Run with `node --test tests/*.test.js` |
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
* Drinks are spread evenly between your start and stop times, then absorbed gradually: half absorbed roughly every 15 minutes on an empty stomach, or every 35 minutes after a meal (with about 10% less reaching the blood).
* Blood alcohol uses the Widmark formula: grams / (body water factor x weight in kg x 10), with 0.68 for a male body and 0.55 for a female body.
* Your body removes about 0.015% per hour at everyday levels (adjustable from 0.010% to 0.020% under **Your body**). Removal slows near zero, so small drinks still show up and "fully clear" errs on the late side.
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

### Thresholds

| Level | What the app treats it as |
| --- | --- |
| Above 0.000% and up to the limit | Impaired |
| Above the legal limit (Botswana 0.05%, editable) | Over the limit |
| 0.08% to 0.15% | Very high |
| 0.15% and above | Blackout risk zone |
| 0.30% and above | Danger, risk of alcohol poisoning |

Blackout risk is raised by a rise faster than 0.05% per hour, more than 3 standard drinks in the last hour, and an empty stomach. More than 5 standard drinks in an hour, or a level of 0.30%, shows the alcohol poisoning card.

## Important

This is an estimate for fun and awareness, not a breathalyser. Food, health, medication and individual metabolism all change the real result. Never use it to decide whether you can drive.

## Make it yours

* Change the footer line in `index.html` to whatever you like.
* After changing files, bump `CACHE = 'dry-season-v2'` in `sw.js` to `v3` so installed copies pick up the update.
