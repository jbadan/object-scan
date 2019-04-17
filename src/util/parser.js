const assert = require('assert');

const throwError = (msg, input, context = {}) => {
  throw new Error(Object.entries(context)
    .reduce((p, [k, v]) => `${p}, ${k} ${v}`, `${msg}: ${input}`));
};

const getSimple = (arrOrSet) => {
  if (Array.isArray(arrOrSet)) {
    return arrOrSet.length === 1 ? arrOrSet[0] : arrOrSet;
  }
  return arrOrSet.size === 1 ? arrOrSet.values().next().value : arrOrSet;
};

class CString extends String {
  constructor(value, excluded) {
    super(value);
    this.excluded = excluded;
  }

  isExcluded() {
    return this.excluded;
  }
}

const Result = (input) => {
  let cResult = new Set();
  let inArray = false;
  let exclusionLevel = false;
  let cursor = 0;

  // group related
  const parentStack = [];
  const newChild = (asOr) => {
    parentStack.push(cResult);
    cResult = asOr ? new Set() : [];
  };
  const finishExcluded = () => {
    if (exclusionLevel !== false && parentStack.length < exclusionLevel) {
      exclusionLevel = false;
    }
  };
  const finishChild = () => {
    const parent = parentStack.pop();
    parent[Array.isArray(parent) ? 'push' : 'add'](getSimple(cResult));
    cResult = parent;
    finishExcluded();
  };

  newChild(false);

  return {
    setInArray: (flag, idx) => {
      if (inArray === flag) {
        throwError(inArray ? 'Bad Array Start' : 'Bad Array Terminator', input, { char: idx });
      }
      inArray = flag;
    },
    finishElement: (idx, { err, fins, finReq = false }) => {
      const isFinished = cursor === idx;
      if (isFinished && !fins.includes(input[idx - 1] || null)) {
        throwError(err, input, { char: idx });
      }
      if (!isFinished) {
        if (finReq) {
          throwError(err, input, { char: idx });
        }
        const ele = input.slice(cursor, idx);
        if (inArray && !/^[*\d]+$/g.test(ele)) {
          throwError('Bad Array Selector', input, { selector: ele });
        }
        cResult.push(new CString(inArray ? `[${ele}]` : ele, exclusionLevel !== false));
      }
      cursor = idx + 1;
    },
    markExcluded: (idx) => {
      if (exclusionLevel !== false) {
        throwError('Redundant Exclusion', input, { char: idx });
      }
      exclusionLevel = parentStack.length;
    },
    startGroup: () => {
      newChild(true);
      newChild(false);
    },
    newGroupElement: () => {
      finishChild();
      newChild(false);
    },
    finishGroup: (idx) => {
      if (parentStack.length < 2) {
        throwError('Unexpected Group Terminator', input, { char: idx });
      }
      finishChild();
      finishChild();
    },
    finalizeResult: () => {
      finishChild();
      assert(exclusionLevel === false);
      if (parentStack.length !== 0) {
        throwError('Non Terminated Group', input);
      }
      if (inArray) {
        throwError('Non Terminated Array', input);
      }
      return getSimple(cResult);
    }
  };
};

module.exports = (input) => {
  if (input === '') {
    return new CString('', false);
  }

  const result = Result(input);
  const inputLength = input.length;
  let escaped = false;

  for (let idx = 0; idx < inputLength; idx += 1) {
    const char = input[idx];
    if (escaped === false) {
      switch (char) {
        case '.':
          result.finishElement(idx, { err: 'Bad Path Separator', fins: [']', '}'] });
          break;
        case '[':
          result.finishElement(idx, { err: 'Bad Array Start', fins: [null, '!', '{', ',', '}', ']'] });
          result.setInArray(true, idx);
          break;
        case ']':
          result.finishElement(idx, { err: 'Bad Array Terminator', fins: ['}'] });
          result.setInArray(false, idx);
          break;
        case '{':
          result.finishElement(idx, { err: 'Bad Group Start', fins: [null, '!', '.', '[', '{', ','], finReq: true });
          result.startGroup();
          break;
        case ',':
          result.finishElement(idx, { err: 'Bad Group Separator', fins: [']', '}'] });
          result.newGroupElement();
          break;
        case '}':
          result.finishElement(idx, { err: 'Bad Group Terminator', fins: [']', '}'] });
          result.finishGroup(idx);
          break;
        case '!':
          result.finishElement(idx, { err: 'Bad Exclusion', fins: [null, '.', ',', '{', '['], finReq: true });
          result.markExcluded(idx);
          break;
        default:
          break;
      }
    }
    escaped = char === '\\' ? !escaped : false;
  }

  result.finishElement(inputLength, { err: 'Bad Terminator', fins: [']', '}'] });
  return result.finalizeResult();
};
