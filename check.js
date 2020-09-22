const puppeteer = require('puppeteer');
const child_process = require('child_process');
const fs = require('fs');

const tesseractCmd = (imagePath) => 'tesseract ' + imagePath + ' - --dpi 134 -l eng';

let outPath = './out2/';
let imagePath = './image2/';
let valiPage = null;

const check = async (domainStart) => {
	const timeHead = Date.now();
	console.log('CHECK START AT --', new Date(timeHead));

	const browser = await puppeteer.launch();

	const formPage = await browser.newPage();
	await formPage.goto('https://who.su/', { waitUntil: 'load' });
	const codePage = await browser.newPage();
	await codePage.goto('https://who.su/turingimagecw.php', { waitUntil: 'load' });

	browser.on('targetcreated', async (target) => {
		valiPage = await target.page();
	});

	const alpha = 'abcdefghijklmnopqrstuvwxyz';
	const num = alpha.length;

	let a,
		b,
        c = 0;
	if (domainStart) {
		a = alpha.indexOf(domainStart.charAt(0));
		b = alpha.indexOf(domainStart.charAt(1));
        c = alpha.indexOf(domainStart.charAt(2));
        
        const sec = domainStart.charAt(0) + "/";
        outPath += sec;
        imagePath += sec;
	}
    console.log('CHECK START WITH -- num :', num, ', a :', a, ', b :', b, ', c :', c);
    
	[ outPath, imagePath ].forEach((path) => {
		if (!fs.existsSync(path)) {
			fs.mkdirSync(path);
		}
	});

	for (; a < num; a++) {
		for (; b < num; b++) {
			for (; c < num; c++) {
				const domain = alpha.charAt(a) + alpha.charAt(b) + alpha.charAt(c);

				let retry = false;
				do {
					retry = await checkDomain(domain, formPage, codePage);
				} while (retry);
			}
			c = 0;
		}
		// b = 0;
	}

	const timeTail = Date.now();
	console.log('CHECK END AT --', new Date(timeTail));
	const timeUsed = timeTail - timeHead;
	console.log('TIME USAGE : TOTAL --', timeUsed, ', AVG --', timeUsed / num / num / num);

	await browser.close();
};

const checkDomain = async (domain, formPage, codePage) => {
	return new Promise(async (resolve, reject) => {
		try {
			const domainName = domainToName(domain);
			console.log('>>> check domain --', domainName);

			await codePage.reload({ waitUntil: 'load' });
			await codePage.waitForSelector('img');
			const codeImage = await codePage.$('img');
			const codePath = imagePath + '/code.png';
			await codeImage.screenshot({ path: codePath, omitBackground: true });

			const code = child_process.execSync(tesseractCmd(codePath)).toString().toUpperCase().substring(0, 5);
			if (/[A-Z]{5}/.test(code) == false) {
				console.log('retry by invalid code --', code);
				resolve(true);
				return;
			}

			const inputDomainSel = 'form>input[name=domain]';
			await formPage.click(inputDomainSel, { clickCount: 3 });
			await formPage.type(inputDomainSel, domain);
			const inputDomain = await formPage.$eval(inputDomainSel, (node) => node.value);
			const inputCodeSel = '#turingcode';
			await formPage.click(inputCodeSel, { clickCount: 3 });
			await formPage.type(inputCodeSel, code);
			const inputCode = await formPage.$eval(inputCodeSel, (node) => node.value);
			console.log('input --', inputDomain, ',', inputCode);
			await formPage.click('form>input[type=submit]');

			await new Promise((resolve) => {
				const timeout = () =>
					setTimeout(() => {
						if (valiPage) {
							resolve();
						} else {
							timeout();
						}
					}, 100);
				timeout();
			});
			await validate(resolve, reject, domainName, valiPage);
		} catch (err) {
            console.log('retry by exception --', err.message);
            resolve(true);
		}
	});
};

const logResult = (domain, isReg) => {
	fs.appendFileSync(isReg ? outPath + '/reg.txt' : outPath + '/unreg.txt', domain + '\n');
};

const domainToName = (domain) => domain + '.su';

const toResolve = async (resolve, result) => {
	resolve(result);
	await valiPage.close();
	valiPage = null;
};

const validate = async (resolve, reject, domainName, valiPage) => {
	const resultSelector = 'body>table';
	await valiPage.waitForSelector(resultSelector);

	const isErr = await valiPage.$eval('body>table>tbody>tr>:first-child', (node) => node.innerHTML);
	if (isErr === domainName) {
		const isYes = await valiPage.$('body>table>tbody>tr>td>font[color=green]');
		if (isYes) {
			console.log(domainName, '-- YES');
			logResult(domainName, false);
			await toResolve(resolve, false);
			return;
		}
		const isNot = await valiPage.$('body>table>tbody>tr>td>font[color=red]');
		if (isNot) {
			console.log(domainName, '-- NOT');
			logResult(domainName, true);
			await toResolve(resolve, false);
			return;
		}
	} else {
		console.log('retry by error --', isErr);
		await toResolve(resolve, true);
	}
};

check('uib');