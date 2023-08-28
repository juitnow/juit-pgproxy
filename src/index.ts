// const string = 'INSERT INTO users(name, email) $$ VALUES($12, $2) RETURNING * $9'
// type Q = Record<'2', string>

// const q: Q = [ 'a', 'b' ] as const


// type XXX<T extends string> = T extends N ? `Y[${T}]` : `N[${T}]`
// type X = XXX<'1'>

// type N = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'

// type SSS = typeof string
// type S = S1<SSS>
// type S1<SSS> =
//     SSS extends `${string}\$${infer Rest}` ? S2<Rest> : never
// type S2<Rest> =
//     Rest extends `${N}${string}` ?
//         Rest extends `${infer C1}${infer C2}${infer C3}${infer C4}` ?
//             C3 extends `${N}` ? number :
//             C2 extends `${N}` ? `${C1}${C2}` | S1<`${C3}${C4}`> :
//             C1 extends `${N}` ? `${C1}` | S1<`${C2}${C3}${C4}`> :
//             S1<Rest> :
//             `[${Rest}]` :
//         S1<Rest>

// function foo<Q extends string, P extends readonly any[] & Record<S1<Q>, any>>(query: Q, ...params: P): void {
//   void query, params
// }
