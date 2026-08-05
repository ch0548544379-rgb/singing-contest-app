const puppeteer = require("puppeteer-core");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
async function run() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox","--disable-gpu"] });
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  const resp = await page.goto("http://localhost:3000/control/control.js?cachebust=" + Date.now());
  const text = await resp.text();
  const marker = "current.name : '";
  const idx = text.indexOf(marker);
  const afterMarker = idx + marker.length;
  const word = text.substring(afterMarker, afterMarker + 6);
  console.log("word after marker:", JSON.stringify(word));
  console.log("char codes:", Array.from(word).map(c => c.charCodeAt(0)));
  await browser.close();
}
run();
