const puppeteer = require("puppeteer-core");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
async function run() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox","--disable-gpu"] });
  const page = await browser.newPage();
  await page.goto("http://localhost:3000/control/", { waitUntil: "networkidle0" });
  const info = await page.evaluate(() => {
    const els = document.querySelectorAll("#currentPerformerLabel");
    return {
      count: els.length,
      outerHTML: els[0] ? els[0].outerHTML : null,
      charCodes: els[0] ? Array.from(els[0].textContent).map(c => c.charCodeAt(0)) : null,
    };
  });
  console.log(JSON.stringify(info));
  await browser.close();
}
run();
