const puppeteer = require("puppeteer-core");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
async function run() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox","--disable-gpu"] });
  const page = await browser.newPage();
  page.on("console", m => console.log("PAGE LOG:", m.text()));
  await page.goto("http://localhost:3000/control/", { waitUntil: "networkidle0" });
  const r = await page.evaluate(() => {
    return { direct: JSON.stringify("אין"), len: "אין".length };
  });
  console.log("direct literal test:", JSON.stringify(r));
  await browser.close();
}
run();
