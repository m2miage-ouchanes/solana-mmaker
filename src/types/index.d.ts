declare module 'decimal.js' {
    interface IDecimal {
        add(n: IDecimal | number | string): IDecimal;
        sub(n: IDecimal | number | string): IDecimal;
        mul(n: IDecimal | number | string): IDecimal;
        div(n: IDecimal | number | string): IDecimal;
        abs(): IDecimal;
        gt(n: IDecimal | number | string): boolean;
        lt(n: IDecimal | number | string): boolean;
        eq(n: IDecimal | number | string): boolean;
        toNumber(): number;
        toString(): string;
        toFixed(dp?: number): string;
        pow(n: number): IDecimal;
    }

    class Decimal implements IDecimal {
        constructor(value: number | string | IDecimal);
        add(n: IDecimal | number | string): IDecimal;
        sub(n: IDecimal | number | string): IDecimal;
        mul(n: IDecimal | number | string): IDecimal;
        div(n: IDecimal | number | string): IDecimal;
        abs(): IDecimal;
        gt(n: IDecimal | number | string): boolean;
        lt(n: IDecimal | number | string): boolean;
        eq(n: IDecimal | number | string): boolean;
        toNumber(): number;
        toString(): string;
        toFixed(dp?: number): string;
        pow(n: number): IDecimal;
    }

    export default Decimal;
} 