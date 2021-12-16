import { DocumentNode } from 'graphql';
import { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { useCallback, useEffect, useState } from 'react';

import {
  LazyQueryHookOptions,
  LazyQueryResult,
  QueryLazyOptions,
  QueryTuple,
} from '../types/types';
import { useQuery } from './useQuery';
import { OperationVariables } from '../../core';

// The following methods, when called will execute the query, regardless of
// whether the useLazyQuery execute function was called before.
const EAGER_METHODS = [
  'refetch',
  'fetchMore',
  'updateQuery',
  'startPolling',
  'subscribeToMore',
] as const;

export function useLazyQuery<TData = any, TVariables = OperationVariables>(
  query: DocumentNode | TypedDocumentNode<TData, TVariables>,
  options?: LazyQueryHookOptions<TData, TVariables>
): QueryTuple<TData, TVariables> {
  const [execution, setExecution] = useState<{
    called: boolean,
    options?: QueryLazyOptions<TVariables>,
    resolve?: (result: LazyQueryResult<TData, TVariables>) => void,
  }>({
    called: false,
  });

  let result = useQuery<TData, TVariables>(query, {
    ...options,
    ...execution.options,
    // We don’t set skip to execution.called, because we need useQuery to call
    // addQueryPromise, so that ssr calls waits for execute to be called.
    fetchPolicy: execution.called ? options?.fetchPolicy : 'standby',
    skip: undefined,
  });

  const execute = useCallback<
    QueryTuple<TData, TVariables>[0]
  >((executeOptions?: QueryLazyOptions<TVariables>) => {
    let resolve!: (result: LazyQueryResult<TData, TVariables>) => void;
    const promise = new Promise<LazyQueryResult<TData, TVariables>>(
      (resolve1) => (resolve = resolve1),
    );
    setExecution((execution) => {
      if (execution.called) {
        resolve(result.refetch(executeOptions?.variables) as any);
        return execution;
      }

      return {
        called: true,
        resolve,
        options: executeOptions,
      };
    });

    return promise;
  }, []);

  // NOTE(brian): I tried to call refetch() for the first call, but some truly
  // strange circular object errors started appearing in jest tests.
  useEffect(() => {
    const { resolve } = execution;
    if (!result.loading && resolve) {
      setExecution((execution) => {
        return { ...execution, resolve: undefined };
      });

      resolve(result);
    }
  }, [result, execution]);

  if (!execution.called) {
    result = {
      ...result,
      loading: false,
      data: void 0 as unknown as TData,
      error: void 0,
      // TODO: fix the type of result
      called: false as any,
    };


    for (const key of EAGER_METHODS) {
      const method = result[key];
      result[key] = (...args: any) => {
        setExecution((execution) => ({ ...execution, called: true }));
        return (method as any)(...args);
      };
    }
  }

  // TODO: fix the type of result
  return [execute, result as LazyQueryResult<TData, TVariables>];
}
