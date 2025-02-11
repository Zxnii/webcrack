import generate from '@babel/generator';
import { NodePath } from '@babel/traverse';
import { CallExpression } from '@babel/types';
import { ArrayRotator } from './arrayRotator';
import { Decoder } from './decoder';
import { StringArray } from './stringArray';

export type Sandbox = (code: string) => Promise<unknown>;

export function createNodeSandbox(): (code: string) => Promise<unknown> {
  return async (code: string) => {
    const {
      default: { Isolate },
    } = await import('isolated-vm');
    const isolate = new Isolate();
    const context = await isolate.createContext();
    return (await context.eval(code, {
      timeout: 10_000,
      copy: true,
      filename: 'file:///obfuscated.js',
    })) as unknown;
  };
}

export class VMDecoder {
  decoders: Decoder[];
  private setupCode: string;
  private sandbox: Sandbox;

  constructor(
    sandbox: Sandbox,
    stringArray: StringArray,
    decoders: Decoder[],
    rotator?: ArrayRotator
  ) {
    this.sandbox = sandbox;
    this.decoders = decoders;

    // Generate as compact to bypass the self defense
    // (which tests someFunction.toString against a regex)
    const stringArrayCode = generate(stringArray.path.node, {
      compact: true,
    }).code;
    const rotatorCode = rotator
      ? generate(rotator.node, { compact: true }).code
      : '';
    const decoderCode = decoders
      .map(decoder => generate(decoder.path.node, { compact: true }).code)
      .join('\n');

    this.setupCode = stringArrayCode + rotatorCode + decoderCode;
  }

  async decode(calls: NodePath<CallExpression>[]): Promise<string[]> {
    return (await this.sandbox(
      `(() => {
        ${this.setupCode}
        return [${calls.join(',')}]
      })()`
    )) as string[];
  }
}
