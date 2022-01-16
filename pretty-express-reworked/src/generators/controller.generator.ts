import { NextFunction, Request, Response, Router } from "express";
import {
  getClassMetadata,
  getMethodMetadata,
} from "../decorators/meta-helpers";
import { IMiddleware, IParamsMetaData } from "../interfaces";
import { defaultHttpErrorMiddleware, defaultValidationErrorHandler, generateValidationMiddleware } from "../middlewares";
import { HttpResponse } from "../models";

/**
 * generate a router after combining multiple routers generated from controllers
 * @param target
 * @returns
 */

export const combineControllers = (controllers: Object[], options? : {
  skipDefaultHttpErrorMiddleware ?: boolean,
  skipDefaultValidationErrorMiddleware ?: boolean,
}) => {
  const router = Router();

  controllers.forEach((item) => {
    router.use(generateRouter(item));
  });

  if(!options || (options && !options.skipDefaultValidationErrorMiddleware)){
    console.log("Setting default validation error middleware")
    router.use(defaultValidationErrorHandler)
  }

  if(!options || (options && !options.skipDefaultHttpErrorMiddleware)){
    console.log("Setting default http error middleware")
    router.use(defaultHttpErrorMiddleware)
  }



  return router;
};

export const generateRouter = (controller: any) => {
  const router = Router();

  const funcData = getMethodMetadata(controller);
  const classData = getClassMetadata(controller);


  if(classData.validation){
    router.use(generateValidationMiddleware(classData.validation.schema, classData.validation.options))
  }

  if (classData.middlewares.length != 0) {
    router.use(...classData.middlewares);
  }

  funcData.forEach((item) => {
    const funcName: any = item.methodName;
    const validMiddlewares : IMiddleware[] = [];
    if(item.validation){
      validMiddlewares.push(generateValidationMiddleware(item.validation.schema, item.validation.options))
    }
    router[item.method](
      item.path,
      ...validMiddlewares,
      ...[item.middlewares],
      generateRequestHandler(controller[funcName], item.paramsMetadata),
      ...[item.errorMiddlewares]
    );
  });

  


  if (classData.errorMiddlewares.length !== 0) {
    router.use(...classData.errorMiddlewares);
  }

  const finalRouter = Router();
  finalRouter.use(classData.baseUrl, router);

  return finalRouter;
};

/**
 * generates a middleware using decorated function and params
 * @param controllerFunction
 * @returns
 */
export const generateRequestHandler = (
  controllerFunction: Function,
  paramsIndex: IParamsMetaData
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const sortedParams = generateSortedParams(req, res, next, paramsIndex);

      const controllerValue = controllerFunction(...sortedParams);
      
      if(controllerValue instanceof HttpResponse){
        return res.status(controllerValue.status).json(controllerValue.json);
      }else{
        // return a status 200 and json as returned value by default
        return res.status(200).json(controllerValue);
      }


    } catch (err) {
      next(err);
    }
  };
};

/**
 * get sorted params to destructure to controller function as params
 * @param req
 * @param res
 * @param next
 * @param paramsIndex
 */
const generateSortedParams = (
  req: any,
  res: Response,
  next: NextFunction,
  paramsIndex: IParamsMetaData | any
): any => {
  const { body, params, query, file, files } = req;

  const sortedParams: { weight: number; value: any; key?: string }[] = [
    {
      value: req,
      weight: 100,
    },
    {
      value: res,
      weight: 101,
    },
    {
      value: next,
      weight: 102,
    },
  ];

  Object.keys(paramsIndex)
    .filter((item) => paramsIndex[item] !== undefined)
    .forEach((key) => {
      let value: any = null;
      if (key === "bodyIndex") {
        value = body;
      }
      if (key === "paramsIndex") {
        value = params;
      }
      if (key === "queryIndex") {
        value = query;
      }
      if (key === "fileIndex") {
        value = file;
      }
      if (key === "filesIndex") {
        value = files;
      }

      sortedParams.push({
        weight: paramsIndex[key],
        value,
        key,
      });
    });

  sortedParams.sort((a, b) => a.weight - b.weight);
  const finalParams = sortedParams.map((item) => item.value);
  return finalParams;
};