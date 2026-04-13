<script lang="ts">
  /**
   * @file This component displays a number in an abbreviated format.
   */
  let {
    num = 0,
    decimalPlaces = 1,
    suffixFontSize,
    suffixColor,
    abbreviationStyle = "western",
  }: {
    num: number;
    decimalPlaces?: number;
    suffixFontSize?: number | undefined;
    suffixColor?: string | undefined;
    abbreviationStyle?: "western" | "cn";
  } = $props();

  function abbreviateNumberSplit(n: number, dp: number): [string, string] {
    if (abbreviationStyle === "cn") {
      if (n >= 1e4 && n < 1e8) return [(n / 1e4).toFixed(dp), "万"];
      if (n >= 1e8 && n < 1e12) return [(n / 1e8).toFixed(dp), "亿"];
      if (n >= 1e12) return [(n / 1e12).toFixed(dp), "兆"];
      return [n.toFixed(0), ""];
    }
    if (n >= 1e3 && n < 1e6) return [(n / 1e3).toFixed(dp), "k"];
    if (n >= 1e6 && n < 1e9) return [(n / 1e6).toFixed(dp), "m"];
    if (n >= 1e9 && n < 1e12) return [(n / 1e9).toFixed(dp), "b"];
    if (n >= 1e12) return [(n / 1e12).toFixed(dp), "t"];
    return [n.toFixed(0), ""];
  }

  let abbreviatedNumberTuple = $derived(
    abbreviateNumberSplit(num, decimalPlaces),
  );
  let fullNumberString = $derived(num.toLocaleString());

  let suffixStyle = $derived(
    [
      suffixFontSize ? `font-size: ${suffixFontSize}px` : "",
      suffixColor ? `color: ${suffixColor}` : "",
    ]
      .filter(Boolean)
      .join("; "),
  );
</script>

<span
  title={fullNumberString}
  class="whitespace-nowrap inline-flex items-baseline gap-0.5"
>
  {abbreviatedNumberTuple[0]}<span
    class="text-tiny text-muted-foreground"
    style={suffixStyle || undefined}>{abbreviatedNumberTuple[1]}</span
  >
</span>
