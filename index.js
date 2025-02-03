//production ready code 


const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const chalk = require("chalk");
const config = require("./config.json");

puppeteer.use(StealthPlugin());

const TIMEOUT = config.timeout || 60000; // Timeout from config or default 60 seconds
const RETRY_LIMIT = 3; // Number of retries for button clicks

const clickButton = async (page, selector, retries = RETRY_LIMIT) => {
  for (let i = 0; i < retries; i++) {
    try {
      await page.waitForSelector(selector, { visible: true, timeout: TIMEOUT });
      const button = await page.$(selector);
      if (button) {
        await button.evaluate((el) => el.scrollIntoView());
        await page.evaluate((sel) => document.querySelector(sel).click(), selector);
        console.log(chalk.green(`Successfully clicked on ${selector}`));
        return;
      }
    } catch (error) {
      console.log(chalk.yellow(`Click attempt ${i + 1} failed for ${selector}. Retrying...`));
      await page.waitForTimeout(1000); // Small delay before retry
    }
  }
  console.log(chalk.red(`Failed to click on ${selector} after ${retries} attempts.`));
  throw new Error(`Failed to click ${selector}`);
};

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--start-maximized", "--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  try {
    console.log(chalk.blue("Navigating to Zepto..."));
    await page.goto("https://www.zeptonow.com/", {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUT,
    });

    console.log(chalk.green(`Page Title: ${await page.title()}`));

    const { location } = config;

    await clickButton(page, 'button[aria-label="Select Location"]');

    await page.waitForSelector('input[placeholder="Search a new address"]', {
      visible: true,
      timeout: TIMEOUT,
    });

    console.log(chalk.blue(`Entering city: ${location.city}`));
    await page.type('input[placeholder="Search a new address"]', location.city, { delay: 100 });

    await page.waitForSelector('div[data-testid="address-search-item"]', {
      visible: true,
      timeout: TIMEOUT,
    });

    await page.click('div[data-testid="address-search-item"]');
    console.log(chalk.blue("Selected address from dropdown."));

    await page.waitForSelector('button[data-testid="location-confirm-btn"]', {
      visible: true,
      timeout: TIMEOUT,
    });
    await page.click('button[data-testid="location-confirm-btn"]');
    console.log(chalk.blue("Confirmed location!"));

    // Search for the product
    await page.waitForSelector('div.inline-block.flex-1 a[data-testid="search-bar-icon"]', {
      visible: true,
      timeout: TIMEOUT,
    });
    await page.evaluate(() => document.querySelector('div.inline-block.flex-1 a[data-testid="search-bar-icon"]').click());
    await page.waitForNavigation({ waitUntil: "networkidle0" });

    await page.waitForSelector('input[placeholder="Search for over 5000 products"]', { visible: true, timeout: TIMEOUT });
    await page.type('input[placeholder="Search for over 5000 products"]', location.product, { delay: 100 });
    await page.keyboard.press("Enter");
    console.log(chalk.blue(`Searching for product: ${location.product}`));

    console.log(chalk.yellow("Waiting for product results..."));
    const productSelector = '[data-testid="product-card"]';
    const productAvailable = await page
      .waitForSelector(productSelector, { visible: true, timeout: 15000 })
      .catch(() => null);

    if (!productAvailable) {
      console.log(chalk.red(`❌ Product "${location.product}" is NOT available currently.`));
    } else {
      console.log(chalk.green(`✅ Product "${location.product}" is available. Extracting details...`));
      const products = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('[data-testid="product-card"]')).map((product) => ({
          name: product.querySelector('[data-testid="product-card-name"]')?.innerText.trim() || "N/A",
          price: product.querySelector('[data-testid="product-card-price"]')?.innerText.trim() || "N/A",
          quantity: product.querySelector('[data-testid="product-card-quantity"] h4')?.innerText.trim() || "N/A",
        }));
      });
      console.log(chalk.green("Extracted product details:"));
      console.table(products);
    }

    // Clicking and checking availability for the first product
    const firstProduct = await page.$('a[data-testid="product-card"]');
    if (firstProduct) {
      await page.evaluate(() => document.querySelector('a[data-testid="product-card"]').click());
      await page.waitForNavigation({ waitUntil: "load", timeout: 10000 });
      await page.reload({ waitUntil: "domcontentloaded" });

      const addToCartButton = await page.$('button[aria-label="Increase quantity by 1"]');
      if (addToCartButton) {
        const isVisible = await page.evaluate((button) => {
          const style = window.getComputedStyle(button);
          return style.opacity !== "0" && !button.disabled;
        }, addToCartButton);

        if (isVisible) {
          await page.evaluate(() => document.querySelector('button[aria-label="Increase quantity by 1"]').click());
          console.log(chalk.green(`Product "${location.product}" is available`));
        } else {
          console.log(chalk.red(`Product "${location.product}" is currently unavailable`));
        }
      } else {
        console.log(chalk.red(`Product "${location.product}" is currently unavailable`));
      }
    } else {
      console.log(chalk.red(`Product "${location.product}" not found.`));
    }

  } catch (error) {
    console.error(chalk.bgRed.white("An error occurred in the main flow:"), error);
  } finally {
    console.log(chalk.magenta("Closing browser..."));
    await browser.close();
  }
})();



