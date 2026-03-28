<script lang="ts">
  /**
   * @file This component displays a number in an abbreviated format.
   */
  let {
    num = 0,
    decimalPlaces = 1,
    suffixFontSize,
    suffixColor,
  }: {
    num: number;
    decimalPlaces?: number;
    suffixFontSize?: number | undefined;
    suffixColor?: string | undefined;
  } = $props();

  function abbreviateNumberSplit(n: number, dp: number): [string, string] {
    if (n >= 1e3 && n < 1e6) return [(n / 1e3).toFixed(dp), "k"];
    if (n >= 1e6 && n < 1e9) return [(n / 1e6).toFixed(dp), "m"];
    if (n >= 1e9 && n < 1e12) return [(n / 1e9).toFixed(dp), "b"];
    if (n >= 1e12) return [(n / 1e12).toFixed(dp), "t"];
    else return [n.toFixed(0), ""];
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
