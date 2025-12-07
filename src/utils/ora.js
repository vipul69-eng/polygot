const defaultFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function ora(initialText = "", options = {}) {
  let text = initialText;
  const frames = options.spinner?.frames || defaultFrames;
  const intervalTime = options.interval || 80;

  let frameIndex = 0;
  let timer = null;
  let isSpinning = false;

  const spinner = {
    start(startText) {
      if (startText) text = startText;
      if (isSpinning) return spinner;

      isSpinning = true;
      timer = setInterval(() => {
        const frame = frames[frameIndex++ % frames.length];
        const output = `${frame} ${text}`;
        process.stdout.write(`\r${output}`);
      }, intervalTime);

      return spinner;
    },

    stop() {
      if (!isSpinning) return spinner;
      clearInterval(timer);
      timer = null;
      isSpinning = false;

      // clear current line
      process.stdout.write("\r");
      return spinner;
    },

    succeed(message) {
      spinner.stop();
      const msg = message || text || "Done";
      console.log(`✅ ${msg}`);
      return spinner;
    },

    fail(message) {
      spinner.stop();
      const msg = message || text || "Failed";
      console.log(`❌ ${msg}`);
      return spinner;
    },

    // simple compatibility with "spinner.text = '...'" pattern
    get text() {
      return text;
    },
    set text(value) {
      text = value;
      // Next tick it’ll render with new text automatically while spinning
    },
  };

  return spinner;
}

module.exports = { ora };
