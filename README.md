# California Paycheck & 401(k) Planner

This project is a lightweight web-based calculator for residents of California to estimate their take‑home pay and project the long‑term value of 401(k) contributions.

## Features

* Calculate annual and per‑period take‑home pay for both *Single* and *Married Filing Jointly* filing statuses.
* Estimate federal and state income taxes, Social Security/Medicare (FICA), California State Disability Insurance (SDI), and pretax 401(k) deferrals.
* Configure your 401(k) contribution rate, company match rate and cap, and the IRS contribution limit.
* Model annual salary raises, investment return rates, and discount rates for present value calculations.
* Interactive charts powered by [Recharts](https://recharts.org/) show your current paycheck breakdown and the growth of your retirement savings over time.
* Built with React and Tailwind CSS, loaded from CDNs, so no build step is required.

## Running Locally

Simply open `index.html` in your browser. All dependencies are pulled from CDNs, so nothing needs to be installed.

## Deploying to GitHub Pages

If you would like to host this calculator yourself, you can upload `index.html` to a new GitHub repository and enable **GitHub Pages** on the `main` branch:

1. Create a new repository on GitHub.
2. Add `index.html` (and optionally this `README.md`) to the repository.
3. Go to **Settings → Pages** and set the source to the `main` branch.
4. After a few minutes, your calculator will be available at `https://&lt;your‑username&gt;.github.io/&lt;repository‑name&gt;/`.

Please note that the tax calculations are simplified and approximate. This tool is for educational purposes only and should not be used as professional tax or investment advice.