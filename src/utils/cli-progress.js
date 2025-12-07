class SingleBar {
  constructor(options = {}) {
    this.format =
      options.format || "Progress |{bar}| {percentage}% | {value}/{total}";

    this.barCompleteChar = options.barCompleteChar || "█";
    this.barIncompleteChar = options.barIncompleteChar || "░";
    this.hideCursor = options.hideCursor ?? true;

    this.total = 0;
    this.value = 0;
    this.barLength = options.barLength || 20;
    this.active = false;
  }

  start(total, startValue = 0) {
    this.total = typeof total === "number" && total > 0 ? total : 1;
    this.value = startValue;
    this.active = true;

    if (this.hideCursor) {
      // hide cursor
      process.stdout.write("\x1B[?25l");
    }

    this._render();
    return this; // for chaining
  }

  update(value) {
    if (!this.active) return this;
    if (typeof value === "number") {
      this.value = Math.max(0, Math.min(value, this.total));
      this._render();
    }
    return this;
  }

  stop() {
    if (!this.active) return this;
    this.active = false;

    // move to next line
    process.stdout.write("\n");

    if (this.hideCursor) {
      // show cursor again
      process.stdout.write("\x1B[?25h");
    }

    return this;
  }

  _render() {
    const percentage = Math.floor((this.value / this.total) * 100);
    const completeBars = Math.round((percentage / 100) * this.barLength);
    const incompleteBars = this.barLength - completeBars;

    const bar =
      this.barCompleteChar.repeat(completeBars) +
      this.barIncompleteChar.repeat(incompleteBars);

    let line = this.format;
    line = line.replace("{bar}", bar);
    line = line.replace("{percentage}", String(percentage).padStart(3, " "));
    line = line.replace("{value}", String(this.value));
    line = line.replace("{total}", String(this.total));

    process.stdout.write(`\r${line}`);
  }
}

module.exports = { SingleBar };
