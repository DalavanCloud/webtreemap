/**
 * Data is the expected shape of input data.
 */
export interface Data {
  /** size should be >= the sum of the children's size. */
  size: number;
  /** children should be sorted by size in descending order. */
  children?: Data[];
  /** caption is optional but can be used to caption each node. */
  caption?: string;
}

/**
 * NODE_CSS_CLASS is the CSS class name that
 * must be applied to nodes created by createNode.
 */
export const NODE_CSS_CLASS = 'webtreemap-node';

/**
 * Options is the set of user-provided webtreemap configuration.
 * More options may be added in the future; to remain backwards-compatible,
 * always start with the object returned by newOptions() and then customize
 * from there.
 */
export interface Options {
  getPadding(): [number, number, number, number];
  getSpacing(): number;
  createNode(data: Data, level: number): HTMLElement;
}

/**
 * newOptions returns a new default Options.
 * More options may be added in the future; to remain backwards-compatible,
 * always start with the object returned by newOptions() and then customize
 * from there.
 */
export function newOptions(): Options {
  return {
    getPadding() {
      return [0, 0, 0, 0];
    },
    getSpacing() { return 0; },
    createNode(data: Data) {
      const dom = document.createElement('div');
      dom.className = NODE_CSS_CLASS;
      return dom;
    }
  };
}

/**
 * newCaptionOptions returns an Options set up to add captions to the
 * display.
 */
export function newCaptionOptions(): Options {
  const options = newOptions();
  const createNode = options.createNode;
  // Add some padding to make space for the caption.
  options.getPadding = () => [14, 0, 0, 0];
  // Override createNode to add a caption to each element.
  options.createNode = (data, level) => {
    const dom = createNode(data, level);
    const caption = document.createElement('div');
    caption.className = 'webtreemap-caption';
    caption.innerText = data.caption!;
    dom.appendChild(caption);
    return dom;
  };
  return options;
}

/**
 * get the index of this node in its parent's children list.
 * O(n) but we expect n to be small.
 */
function getNodeIndex(node: Element): number {
  let index = 0;
  while (node = node.previousElementSibling) {
    if (node.classList.contains(NODE_CSS_CLASS)) index++;
  }
  return index;
}

export class TreeMap {
  constructor(private data: Data, private options = newOptions()) {}

  /**
   * Given a list of sizes, the 1-d space available
   * |space|, and a starting rectangle index |start|, compute a span of
   * rectangles that optimizes a pleasant aspect ratio.
   *
   * Returns [end, sum], where end is one past the last rectangle and sum is the
   * 2-d sum of the rectangles' areas.
   */
  private selectSpan(children: Data[], space: number, start: number):
      {end: number, sum: number} {
    // Add rectangles one by one, stopping when aspect ratios begin to go
    // bad.  Result is [start,end) covering the best run for this span.
    // http://scholar.google.com/scholar?cluster=5972512107845615474
    let smin = children[start].size;  // Smallest seen child so far.
    let smax = smin;                  // Largest child.
    let sum = 0;                      // Sum of children in this span.
    let lastScore = 0;                // Best score yet found.
    let end = start;
    for (; end < children.length; end++) {
      const size = children[end].size;
      if (size < smin) smin = size;
      if (size > smax) smax = size;

      // Compute the relative squariness of the rectangles with this
      // additional rectangle included.
      const nextSum = sum + size;

      // Suppose you're laying out along the x axis, so "space"" is the
      // available width.  Then the height of the span of rectangles is
      //   height = sum/space
      //
      // The largest rectangle potentially will be too wide.
      // Its width and width/height ratio is:
      //   width = smax / height
      //   width/height = (smax / (sum/space)) / (sum/space)
      //                = (smax * space * space) / (sum * sum)
      //
      // The smallest rectangle potentially will be too narrow.
      // Its width and height/width ratio is:
      //   width = smin / height
      //   height/width = (sum/space) / (smin / (sum/space))
      //                = (sum * sum) / (smin * space * space)
      //
      // Take the larger of these two ratios as the measure of the
      // worst non-squarenesss.
      const score = Math.max(
          smax * space * space / (nextSum * nextSum),
          nextSum * nextSum / (smin * space * space));
      if (lastScore && score > lastScore) {
        // Including this additional rectangle produces worse squareness than
        // without it.  We're done.
        break;
      }
      lastScore = score;
      sum = nextSum;
    }
    return {end, sum};
  }

  private layout(
      container: HTMLElement, data: Data, level: number, width: number,
      height: number) {
    const total: number = data.size;
    const children = data.children;
    if (!children) return;

    let x1 = 0, y1 = 0, x2 = width, y2 = height;

    const spacing = this.options.getSpacing();
    const padding = this.options.getPadding();
    y1 += padding[0];
    x2 -= padding[1];
    y2 -= padding[2];
    x1 += padding[3];

    if ((x2 - x1) < 40) return;
    if ((y2 - y1) < 100) return;
    const scale = Math.sqrt(total / ((x2 - x1) * (y2 - y1)));
    function px(x: number) {
      // Rounding when computing pixel coordinates makes the box edges touch
      // better
      // than letting the browser do it, because the browser has lots of
      // heuristics
      // around handling non-integer pixel coordinates.
      return Math.round(x) + 'px';
    }
    var x = x1, y = y1;
    for (let start = 0; start < children.length;) {
      x = x1;
      const space = scale * (x2 - x1);
      const {end, sum} = this.selectSpan(children, space, start);
      if (sum / total < 0.1) break;
      const height = sum / space;
      const heightPx = height / scale;
      for (let i = start; i < end; i++) {
        const size = children[i].size;
        const width = size / height;
        const widthPx = width / scale;
        const dom = this.options.createNode(children[i], level + 1);
        dom.style.left = px(x);
        dom.style.width = px(widthPx - spacing);
        dom.style.top = px(y);
        dom.style.height = px(heightPx - spacing);
        container.appendChild(dom);

        // We lose 2px due to the border.
        this.layout(dom, children[i], level + 1, widthPx - 2, heightPx - 2);

        x += widthPx;
      }
      y += heightPx;
      start = end;
    }
  }

  render(container: HTMLElement) {
    const dom = this.options.createNode(this.data, 0);
    const width = container.offsetWidth;
    const height = container.offsetHeight;
    dom.style.width = width + 'px';
    dom.style.height = height + 'px';
    container.appendChild(dom);
    this.layout(dom, this.data, 0, width, height);
  }

  getAddress(node: HTMLElement): Data[] {
    let indexes: number[] = [];
    while (node && node.classList.contains(NODE_CSS_CLASS)) {
      indexes.unshift(getNodeIndex(node));
      node = node.parentElement;
    }
    indexes.shift();  // The first element will be the root, index 0.

    let data = this.data;
    let address: Data[] = [data];
    for (let i of indexes) {
      data = data.children![i];
      address.push(data);
    }
    return address;
  }
}
