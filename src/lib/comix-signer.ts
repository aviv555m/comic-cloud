// [RC4 key, mutKey, prefKey] x 5 rounds. Matches the current Comix request signature.
const COMIX_KEYS = [
    "JxTcdyiA5GZxnbrmthXBQfU2IMTKcY1+3nNhbq98Sgo=",
    "3PordjODbhqla382Cxapmo/1JiABJQcjiJj1+48gTJ4=",
    "OaKvnI5ARA==",
    "MHNBHYWA7lvy867fXgvGcJwWDk79KqUJUVFsh3RwnnI=",
    "8i0Cru/VJBSVB2Y1GcMDVpzx2WepOcfnWdd81yxICl4=",
    "Fyskubz8VvA=",
    "B46L1x+UeWP+19cRpQ+OZvdLAK9EHID8g3mSgn57tew=",
    "DTSTmUt6LpDUw9r1lSQqyb3YlFTzruT8tk8wUGkwehQ=",
    "vY/meeI=",
    "7xWfIF5THL5LAnRgAARg+4mjWHPU9n3PQwvzbaMNi+Q=",
    "bewtiTuV+HJk56xxkf2iCljLgruCpBmN9BgE8i6gc9M=",
    "/Xcb2zAu8AU=",
    "WgeCQ3T8R51uTwVSiVa7Zy0dN6JOg6Z5JleMS+HV8Aw=",
    "yXayUVFrrcW56jQCEfZzuCidjpnWKjTDUNT7XeX9i7k=",
    "tSLco2w=",
];

const B64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function b64ToBytes(b64: string): Uint8Array {
    const source = b64.replace(/=+$/, "");
    const output = new Uint8Array((source.length * 6) >> 3);
    let outIndex = 0;
    let bits = 0;
    let bitCount = 0;

    for (let i = 0; i < source.length; i++) {
        bits = (bits << 6) | B64_ALPHABET.indexOf(source.charAt(i));
        bitCount += 6;
        if (bitCount >= 8) {
            bitCount -= 8;
            output[outIndex++] = (bits >> bitCount) & 0xff;
        }
    }

    return output;
}

function bytesToUrlB64NoPad(bytes: Uint8Array): string {
    let output = "";
    let bits = 0;
    let bitCount = 0;

    for (let i = 0; i < bytes.length; i++) {
        bits = (bits << 8) | bytes[i];
        bitCount += 8;
        while (bitCount >= 6) {
            bitCount -= 6;
            output += B64_URL_ALPHABET.charAt((bits >> bitCount) & 0x3f);
        }
    }

    if (bitCount > 0) {
        output += B64_URL_ALPHABET.charAt((bits << (6 - bitCount)) & 0x3f);
    }

    return output;
}

function strToAsciiBytes(value: string): Uint8Array {
    const output = new Uint8Array(value.length);
    for (let i = 0; i < value.length; i++) {
        output[i] = value.charCodeAt(i) & 0xff;
    }
    return output;
}

function getKeyBytes(index: number): Uint8Array {
    return b64ToBytes(COMIX_KEYS[index]);
}

function rc4(key: Uint8Array, data: Uint8Array): Uint8Array {
    if (key.length === 0) {
        return new Uint8Array(data);
    }

    const state = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
        state[i] = i;
    }

    let j = 0;
    for (let i = 0; i < 256; i++) {
        j = (j + state[i] + key[i % key.length]) & 0xff;
        const tmp = state[i];
        state[i] = state[j];
        state[j] = tmp;
    }

    const output = new Uint8Array(data.length);
    let i = 0;
    j = 0;

    for (let n = 0; n < data.length; n++) {
        i = (i + 1) & 0xff;
        j = (j + state[i]) & 0xff;
        const tmp = state[i];
        state[i] = state[j];
        state[j] = tmp;
        output[n] = data[n] ^ state[(state[i] + state[j]) & 0xff];
    }

    return output;
}

function opShiftRight7Left1(value: number): number {
    return ((value >>> 7) | (value << 1)) & 0xff;
}

function opShiftLeft1Right7(value: number): number {
    return ((value << 1) | (value >>> 7)) & 0xff;
}

function opShiftRight2Left6(value: number): number {
    return ((value >>> 2) | (value << 6)) & 0xff;
}

function opShiftLeft4Right4(value: number): number {
    return ((value << 4) | (value >>> 4)) & 0xff;
}

function opShiftRight4Left4(value: number): number {
    return ((value >>> 4) | (value << 4)) & 0xff;
}

function getMutKey(mutKey: Uint8Array, index: number): number {
    const keyIndex = index % 32;
    return mutKey.length > 0 && keyIndex < mutKey.length ? mutKey[keyIndex] : 0;
}

function mutateRound(data: Uint8Array, mutKeyIndex: number, prefKeyIndex: number, prefLength: number, round: number): Uint8Array {
    const mutKey = getKeyBytes(mutKeyIndex);
    const prefKey = getKeyBytes(prefKeyIndex);
    const output: number[] = [];

    for (let i = 0; i < data.length; i++) {
        if (i < prefLength && i < prefKey.length) {
            output.push(prefKey[i]);
        }

        let value = (data[i] ^ getMutKey(mutKey, i)) & 0xff;
        const mode = i % 10;

        switch (round) {
            case 1:
                switch (mode) {
                    case 0:
                        value = opShiftRight7Left1(value);
                        break;
                    case 1:
                        value ^= 37;
                        break;
                    case 2:
                        value ^= 81;
                        break;
                    case 3:
                        value ^= 147;
                        break;
                    case 4:
                        value = opShiftRight2Left6(value);
                        break;
                    case 5:
                    case 8:
                        value = opShiftRight4Left4(value);
                        break;
                    case 6:
                        value ^= 218;
                        break;
                    case 7:
                        value = (value + 159) & 0xff;
                        break;
                    case 9:
                        value ^= 180;
                        break;
                    default:
                        break;
                }
                break;
            case 2:
                switch (mode) {
                    case 0:
                    case 9:
                        value ^= 180;
                        break;
                    case 1:
                        value = opShiftLeft1Right7(value);
                        break;
                    case 2:
                        value ^= 147;
                        break;
                    case 3:
                        value = opShiftRight7Left1(value);
                        break;
                    case 4:
                        value = opShiftRight2Left6(value);
                        break;
                    case 5:
                        value = opShiftRight4Left4(value);
                        break;
                    case 6:
                    case 8:
                        value = (value + 159) & 0xff;
                        break;
                    case 7:
                        value = (value + 34) & 0xff;
                        break;
                    default:
                        break;
                }
                break;
            case 3:
                switch (mode) {
                    case 0:
                        value ^= 81;
                        break;
                    case 1:
                        value = opShiftRight4Left4(value);
                        break;
                    case 2:
                    case 9:
                        value = opShiftLeft4Right4(value);
                        break;
                    case 3:
                        value ^= 37;
                        break;
                    case 4:
                        value = (value + 159) & 0xff;
                        break;
                    case 5:
                        value = opShiftLeft1Right7(value);
                        break;
                    case 6:
                        value ^= 180;
                        break;
                    case 7:
                        value = (value + 34) & 0xff;
                        break;
                    case 8:
                        value = opShiftRight2Left6(value);
                        break;
                    default:
                        break;
                }
                break;
            case 4:
                switch (mode) {
                    case 0:
                    case 7:
                        value ^= 218;
                        break;
                    case 1:
                    case 4:
                        value = opShiftLeft1Right7(value);
                        break;
                    case 2:
                        value = opShiftRight7Left1(value);
                        break;
                    case 3:
                        value = (value + 159) & 0xff;
                        break;
                    case 5:
                    case 8:
                        value ^= 180;
                        break;
                    case 6:
                        value ^= 147;
                        break;
                    case 9:
                        value ^= 37;
                        break;
                    default:
                        break;
                }
                break;
            case 5:
                switch (mode) {
                    case 0:
                        value = opShiftLeft4Right4(value);
                        break;
                    case 1:
                    case 3:
                        value ^= 147;
                        break;
                    case 2:
                        value = (value + 34) & 0xff;
                        break;
                    case 4:
                    case 9:
                        value ^= 218;
                        break;
                    case 5:
                    case 7:
                        value = opShiftLeft1Right7(value);
                        break;
                    case 6:
                        value ^= 180;
                        break;
                    case 8:
                        value = opShiftRight2Left6(value);
                        break;
                    default:
                        break;
                }
                break;
            default:
                break;
        }

        output.push(value & 0xff);
    }

    return new Uint8Array(output);
}

function applyRound(data: Uint8Array, rc4KeyIndex: number, mutKeyIndex: number, prefKeyIndex: number, prefLength: number, round: number): Uint8Array {
    const mutated = mutateRound(data, mutKeyIndex, prefKeyIndex, prefLength, round);
    return rc4(getKeyBytes(rc4KeyIndex), mutated);
}

function round1(data: Uint8Array): Uint8Array {
    return applyRound(data, 0, 1, 2, 7, 1);
}

function round2(data: Uint8Array): Uint8Array {
    return applyRound(data, 3, 4, 5, 8, 2);
}

function round3(data: Uint8Array): Uint8Array {
    return applyRound(data, 6, 7, 8, 5, 3);
}

function round4(data: Uint8Array): Uint8Array {
    return applyRound(data, 9, 10, 11, 8, 4);
}

function round5(data: Uint8Array): Uint8Array {
    return applyRound(data, 12, 13, 14, 5, 5);
}

export function generateComixHash(path: string): string {
    const encoded = encodeURIComponent(path)
        .replace(/\+/g, "%20")
        .replace(/\*/g, "%2A")
        .replace(/%7E/g, "~");
    const bytes = strToAsciiBytes(encoded);
    const result = round5(round4(round3(round2(round1(bytes)))));
    return bytesToUrlB64NoPad(result);
}
