const puppeteer = require("puppeteer-core");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
async function run() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox","--disable-gpu"] });
  const page = await browser.newPage();
  const resp = await page.goto("http://localhost:3000/control/control.js");
  console.log("content-type header:", resp.headers()["content-type"]);
  const text = await resp.text();
  const idx = text.indexOf("currentPerformerLabel").valueOf();
  const snippet = text.substring(idx, idx + 120);
  console.log("snippet:", JSON.stringify(snippet));
  console.log("char codes:", Array.from(snippet).slice(-10).map(c => c.charCodeAt(0)));
  await browser.close();
}
run();
