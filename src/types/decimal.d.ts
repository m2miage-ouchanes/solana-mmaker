declare module 'decimal.js' {
    class Decimal {
        constructor(value: number | string | Decimal);

        add(n: Decimal | number | string): Decimal;
        sub(n: Decimal | number | string): Decimal;
        mul(n: Decimal | number | string): Decimal;
        div(n: Decimal | number | string): Decimal;
        abs(): Decimal;
        gt(n: Decimal | number | string): boolean;
        lt(n: Decimal | number | string): boolean;
        eq(n: Decimal | number | string): boolean;
        toNumber(): number;
        toString(): string;
        toFixed(dp?: number): string;
        pow(n: number): Decimal;
    }

    export default Decimal;
} 