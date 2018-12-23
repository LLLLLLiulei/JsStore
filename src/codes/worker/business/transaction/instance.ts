import { TranscationQuery, WebWorkerRequest, SelectQuery, RemoveQuery, CountQuery, UpdateQuery, InsertQuery } from "../../types";
import { Base } from "../base";
import * as Select from '../select/index';
import * as Count from '../count/index';
import * as Insert from '../insert/index';
import * as Remove from '../remove/index';
import * as Update from '../update/index';
import { API } from "../../enums";
import { QueryHelper } from "../query_helper";
import { IError } from "../../interfaces";

export class Instance extends Base {
    query: TranscationQuery;
    results;
    requestQueue: WebWorkerRequest[] = [];
    isQueryExecuting = false;
    isTransactionStarted = false;

    constructor(qry: TranscationQuery, onSuccess: (results: any) => void, onError: (err: IError) => void) {
        super();
        this.query = qry;
        this.onError = onError;
        this.onSuccess = onSuccess;
        this.results = {};
    }

    execute() {
        const select = (qry: SelectQuery) => {
            return this.pushRequest({
                name: API.Select,
                query: qry
            } as WebWorkerRequest);
        };
        const insert = (qry: InsertQuery) => {
            return this.pushRequest({
                name: API.Insert,
                query: qry
            } as WebWorkerRequest);
        };
        const update = (qry: UpdateQuery) => {
            return this.pushRequest({
                name: API.Update,
                query: qry
            } as WebWorkerRequest);
        };
        const remove = (qry: RemoveQuery) => {
            return this.pushRequest({
                name: API.Remove,
                query: qry
            } as WebWorkerRequest);
        };
        const count = (qry: CountQuery) => {
            return this.pushRequest({
                name: API.Count,
                query: qry
            } as WebWorkerRequest);
        };
        const setResult = (key: string, value) => {
            this.results[key] = value;
        };
        const abort = () => {
            this.abortTransaction();
        };
        const txLogic = null;
        eval("txLogic =" + this.query.logic);
        txLogic.call(this, this.query.data);

        this.checkQueries().then(() => {
            this.startTransaction_();
        }).catch((err) => {
            this.onError(err);
        });

    }

    private startTransaction_() {
        try {
            this.isTransactionStarted = true;
            this.initTransaction_(this.query.tables);
            this.processExecutionOfQry();
        }
        catch (ex) {
            this.errorOccured = true;
            this.onExceptionOccured(ex, { tableName: this.query.tables });
        }
    }

    private initTransaction_(tableNames) {
        this.createTransaction(tableNames, this.onTransactionCompleted_.bind(this));
    }

    private onTransactionCompleted_() {
        this.onSuccess(this.results);
    }

    onRequestFinished_(result) {
        const finisehdRequest = this.requestQueue.shift();
        if (finisehdRequest) {
            if (this.errorOccured) {
                this.abortTransaction();
            }
            else {
                this.isQueryExecuting = false;
                if (finisehdRequest.onSuccess) {
                    finisehdRequest.onSuccess(result);
                }
                this.processExecutionOfQry();
            }
        }
    }

    abortTransaction() {
        if (this.transaction != null) {
            this.transaction.abort();
        }
    }

    executeRequest(request: WebWorkerRequest) {
        this.isQueryExecuting = true;
        let requestObj;
        switch (request.name) {
            case API.Select:
                requestObj = new Select.Instance(
                    request.query, this.onRequestFinished_.bind(this), this.onError.bind(this)
                );
                break;
            case API.Insert:
                requestObj = new Insert.Instance(
                    request.query, this.onRequestFinished_.bind(this), this.onError.bind(this)
                );
                break;
            case API.Update:
                requestObj = new Update.Instance(
                    request.query, this.onRequestFinished_.bind(this), this.onError.bind(this)
                );
                break;
            case API.Remove:
                requestObj = new Remove.Instance(
                    request.query, this.onRequestFinished_.bind(this), this.onError.bind(this)
                );
                break;
            case API.Count:
                requestObj = new Count.Instance(
                    request.query, this.onRequestFinished_.bind(this), this.onError.bind(this)
                );
                break;
        }
        requestObj.isTransaction = true;
        requestObj.execute();
    }

    pushRequest(request: WebWorkerRequest) {
        this.requestQueue.push(request);
        this.processExecutionOfQry();
        return new Promise((resolve, reject) => {
            request.onSuccess = (result) => {
                resolve(result);
            };
            request.onError = (error) => {
                reject(error);
            };
        });
    }

    processExecutionOfQry() {
        if (this.requestQueue.length > 0 && this.isQueryExecuting === false &&
            this.isTransactionStarted === true) {
            this.executeRequest(this.requestQueue[0]);
        }
    }

    private checkQueries() {
        let index = 0;
        return new Promise((resolve, reject) => {
            const checkQuery = () => {
                if (index < this.requestQueue.length) {
                    const request = this.requestQueue[index++];
                    const qryHelper = new QueryHelper(request.name, request.query);
                    qryHelper.checkAndModify().then(() => {
                        checkQuery();
                    }).catch((err: IError) => {
                        reject(err);
                    });
                }
                else {
                    resolve();
                }
            };
            checkQuery();
        });
    }
}