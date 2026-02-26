let quote = "";
let words: string[] = [];
let wordIndex = 0;
let writtenWords: string[] = [];
let currentWord = "";
let startTime: number | null = null;
let finished = false;
let finalWpm = 0;
let loading = false;
let wpmInterval: ReturnType<typeof setInterval> | null = null;

const PAD = 4;

function moveTo(row: number, col: number) {
    return `\x1b[${row};${col}H`;
}
function yellow(s: string) {
    return `\x1b[33m${s}\x1b[0m`;
}
function red(s: string) {
    return `\x1b[31m${s}\x1b[0m`;
}
function green(s: string) {
    return `\x1b[32m${s}\x1b[0m`;
}
function dim(s: string) {
    return `\x1b[2m${s}\x1b[0m`;
}

async function fetchQuote(): Promise<string> {
    loading = true;
    render();
    try {
        const res = await fetch("https://zenquotes.io/api/random");
        const data = await res.json();
        return data[0].q;
    } catch {
        return "The only way to do great work is to love what you do.";
    } finally {
        loading = false;
    }
}

function resetState(newQuote: string) {
    if (wpmInterval) {
        clearInterval(wpmInterval);
        wpmInterval = null;
    }
    quote = newQuote;
    words = quote.split(" ");
    wordIndex = 0;
    writtenWords = [];
    currentWord = "";
    startTime = null;
    finished = false;
    finalWpm = 0;
}

function calculateWpm(): number {
    if (finished) return finalWpm;
    if (!startTime || wordIndex === 0) return 0;
    const minutes = (Date.now() - startTime) / 60000;
    if (minutes < 0.001) return 0;
    const correct = writtenWords.filter((w, i) => w === words[i]).length;
    return Math.round(correct / minutes);
}

function colorWord(expected: string, typed: string): { plain: string; colored: string } {
    let plain = "";
    let colored = "";
    const len = Math.max(expected.length, typed.length);

    for (let i = 0; i < len; i++) {
        if (i < typed.length) {
            const ch = typed[i];
            const exp = i < expected.length ? expected[i] : null;
            plain += ch;
            colored += ch === exp ? yellow(ch) : red(ch);
        } else {
            plain += expected[i];
            colored += expected[i];
        }
    }

    return { plain, colored };
}

function render() {
    const width = process.stdout.columns;
    const height = process.stdout.rows;
    const maxWidth = width - PAD * 2;

    if (loading) {
        const msg = "Fetching quote...";
        const x = PAD + Math.floor((maxWidth - msg.length) / 2);
        const y = Math.floor(height / 2);
        process.stdout.write("\x1b[2J" + moveTo(y, x) + dim(msg));
        return;
    }

    if (!words.length) return;

    // Color each word based on typing progress
    const displayWords: { plain: string; colored: string }[] = [];
    for (let i = 0; i < words.length; i++) {
        if (i < wordIndex) {
            displayWords.push(colorWord(words[i], writtenWords[i]));
        } else if (i === wordIndex) {
            displayWords.push(colorWord(words[i], currentWord));
        } else {
            displayWords.push({ plain: words[i], colored: words[i] });
        }
    }

    // Word-wrap into lines
    const wrappedLines: { plain: string; colored: string }[] = [];
    let linePlain = "";
    let lineColored = "";

    for (const w of displayWords) {
        if (linePlain && linePlain.length + 1 + w.plain.length > maxWidth) {
            wrappedLines.push({ plain: linePlain, colored: lineColored });
            linePlain = w.plain;
            lineColored = w.colored;
        } else if (linePlain) {
            linePlain += " " + w.plain;
            lineColored += " " + w.colored;
        } else {
            linePlain = w.plain;
            lineColored = w.colored;
        }
    }
    if (linePlain) {
        wrappedLines.push({ plain: linePlain, colored: lineColored });
    }

    // Calculate WPM
    const wpm = calculateWpm();
    const wpmText = `${wpm} wpm`;

    // All output lines
    const allLines: { plain: string; colored: string }[] = [
        { plain: wpmText, colored: dim(wpmText) },
        { plain: "", colored: "" },
        ...wrappedLines,
        { plain: "", colored: "" },
    ];

    if (finished) {
        const doneMsg = "Press Enter for a new quote";
        allLines.push({ plain: doneMsg, colored: green(doneMsg) });
    } else {
        const helpMsg = "Press Ctrl+C to quit";
        allLines.push({ plain: helpMsg, colored: helpMsg });
    }

    // Cursor position in the plain text
    let cursorOffset = 0;
    for (let i = 0; i < wordIndex; i++) {
        cursorOffset += displayWords[i].plain.length + 1;
    }
    cursorOffset += currentWord.length;

    // Draw
    const startY = PAD + Math.floor((height - PAD * 2 - allLines.length) / 2);
    let buf = "\x1b[?2026h\x1b[?25l\x1b[2J";

    let charOffset = 0;
    let cursorRow = -1;
    let cursorCol = -1;

    for (let i = 0; i < allLines.length; i++) {
        const line = allLines[i];
        const x = PAD + Math.floor((maxWidth - line.plain.length) / 2);
        const y = startY + i;

        const isQuoteLine = i >= 2 && i < 2 + wrappedLines.length;
        if (isQuoteLine) {
            if (cursorOffset >= charOffset && cursorOffset <= charOffset + line.plain.length) {
                cursorRow = y;
                cursorCol = x + (cursorOffset - charOffset);
            }
            charOffset += line.plain.length + 1;
        }

        buf += moveTo(y, x) + line.colored;
    }

    if (cursorRow !== -1) {
        buf += moveTo(cursorRow, cursorCol);
    }

    buf += "\x1b[?25h\x1b[?2026l";
    process.stdout.write(buf);
}

function finishQuote() {
    if (wpmInterval) {
        clearInterval(wpmInterval);
        wpmInterval = null;
    }
    writtenWords.push(currentWord);
    const minutes = startTime ? (Date.now() - startTime) / 60000 : 0;
    const correct = writtenWords.filter((w, i) => w === words[i]).length;
    finalWpm = minutes > 0.001 ? Math.round(correct / minutes) : 0;
    currentWord = "";
    wordIndex = words.length;
    finished = true;
    render();
}

async function handleKeypress(key: string) {
    if (key === "\u0003") {
        if (wpmInterval) clearInterval(wpmInterval);
        process.stdout.write("\x1b[?1049l\x1b[?25h");
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.exit(0);
    }

    if (loading) return;

    // Enter - fetch new quote when finished
    if (key === "\r") {
        if (finished || !quote) {
            const newQuote = await fetchQuote();
            resetState(newQuote);
            render();
        }
        return;
    }

    if (finished) return;

    if (!startTime && key.length === 1 && key >= "!" && key <= "~") {
        startTime = Date.now();
        wpmInterval = setInterval(render, 500);
    }

    // Ctrl+Backspace - clear word
    if (key === "\b") {
        currentWord = "";
        render();
        return;
    }

    // Backspace - delete char or go back a word
    if (key === "\x7f") {
        if (currentWord.length > 0) {
            currentWord = currentWord.slice(0, -1);
        } else if (wordIndex > 0) {
            wordIndex--;
            currentWord = writtenWords.pop()!;
        }
        render();
        return;
    }

    // Space - submit word and advance
    if (key === " ") {
        if (wordIndex < words.length - 1) {
            writtenWords.push(currentWord);
            currentWord = "";
            wordIndex++;
            render();
        } else if (wordIndex === words.length - 1) {
            // Last word - finish the quote
            finishQuote();
        }
        return;
    }

    // Regular character
    if (key.length === 1 && key >= "!" && key <= "~") {
        currentWord += key;

        // Check if last word is fully typed correctly
        if (wordIndex === words.length - 1 && currentWord === words[wordIndex]) {
            finishQuote();
            return;
        }

        render();
    }
}

// Start
process.stdout.write("\x1b[?1049h");
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.setEncoding("utf8");
process.stdin.on("data", handleKeypress);
process.stdout.on("resize", render);

// Fetch initial quote
(async () => {
    const initialQuote = await fetchQuote();
    resetState(initialQuote);
    render();
})();
