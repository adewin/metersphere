import {
  Element,
  HTTPSamplerProxy,
  HashTree,
  TestElement,
  TestPlan,
  ThreadGroup,
  HeaderManager,
  HTTPSamplerArguments,
  ResponseCodeAssertion,
  ResponseDataAssertion,
  ResponseHeadersAssertion, DefaultTestElement
} from "./JMX";

export const generateId = function () {
  return Math.floor(Math.random() * 10000);
};

export const BODY_TYPE = {
  KV: "KeyValue",
  FORM_DATA: "Form Data",
  RAW: "Raw"
}

export const ASSERTION_TYPE = {
  TEXT: "Text",
  REGEX: "Regex",
  RESPONSE_TIME: "Response Time"
}

export const ASSERTION_REGEX_SUBJECT = {
  RESPONSE_CODE: "Response Code",
  RESPONSE_HEADERS: "Response Headers",
  RESPONSE_DATA: "Response Data"
}

export class BaseConfig {

  set(options) {
    options = this.initOptions(options)

    for (let name in options) {
      if (options.hasOwnProperty(name)) {
        if (!(this[name] instanceof Array)) {
          this[name] = options[name];
        }
      }
    }
  }

  sets(types, options) {
    options = this.initOptions(options)
    if (types) {
      for (let name in types) {
        if (types.hasOwnProperty(name) && options.hasOwnProperty(name)) {
          options[name].forEach((o) => {
            this[name].push(new types[name](o));
          })
        }
      }
    }
  }

  initOptions(options) {
    return options || {};
  }

  isValid() {
    return true;
  }
}

export class Test extends BaseConfig {
  constructor(options) {
    super();
    this.version = '1.0.0';
    this.id = null;
    this.name = null;
    this.projectId = null;
    this.scenarioDefinition = [];

    this.set(options);
    this.sets({scenarioDefinition: Scenario}, options);
  }

  initOptions(options) {
    options = options || {};
    options.scenarioDefinition = options.scenarioDefinition || [new Scenario()];
    return options;
  }

  toJMX() {
    return {
      name: this.name + '.jmx',
      xml: new JMXGenerator(this).toXML()
    };
  }
}

export class Scenario extends BaseConfig {
  constructor(options) {
    super();
    this.id = generateId();
    this.name = null;
    this.url = null;
    this.parameters = [];
    this.headers = [];
    this.requests = [];

    this.set(options);
    this.sets({parameters: KeyValue, headers: KeyValue, requests: Request}, options);
  }

  initOptions(options) {
    options = options || {};
    options.requests = options.requests || [new Request()];
    return options;
  }
}

export class Request extends BaseConfig {
  constructor(options) {
    super();
    this.id = generateId();
    this.name = null;
    this.url = null;
    this.method = null;
    this.parameters = [];
    this.headers = [];
    this.body = null;
    this.assertions = null;
    this.extract = [];

    this.set(options);
    this.sets({parameters: KeyValue, headers: KeyValue}, options);
    // TODO assigns extract
  }

  initOptions(options) {
    options = options || {};
    options.method = "GET";
    options.body = new Body(options.body);
    options.assertions = new Assertions(options.assertions);
    return options;
  }
}

export class Body extends BaseConfig {
  constructor(options) {
    super();
    this.type = null;
    this.raw = null;
    this.kvs = [];

    this.set(options);
    this.sets({kvs: KeyValue}, options);
  }

  isValid() {
    if (this.isKV()) {
      return this.kvs.some(kv => {
        return kv.isValid();
      })
    } else {
      return !!this.raw;
    }
  }

  isKV() {
    return this.type === BODY_TYPE.KV;
  }
}

export class KeyValue extends BaseConfig {
  constructor() {
    let options, key, value;
    if (arguments.length === 1) {
      options = arguments[0];
    }

    if (arguments.length === 2) {
      key = arguments[0];
      value = arguments[1];
    }

    super();
    this.name = key;
    this.value = value;

    this.set(options);
  }

  isValid() {
    return !!this.name || !!this.value;
  }
}

export class Assertions extends BaseConfig {
  constructor(options) {
    super();
    this.text = [];
    this.regex = [];
    this.duration = null;

    this.set(options);
    this.sets({text: Text, regex: Regex}, options);
  }

  initOptions(options) {
    options = options || {};
    options.duration = new ResponseTime(options.duration);
    return options;
  }
}

export class AssertionType extends BaseConfig {
  constructor(type) {
    super();
    this.type = type;
  }
}

export class Text extends AssertionType {
  constructor(options) {
    super(ASSERTION_TYPE.TEXT);
    this.subject = null;
    this.condition = null;
    this.value = null;

    this.set(options);
  }
}

export class Regex extends AssertionType {
  constructor(options) {
    super(ASSERTION_TYPE.REGEX);
    this.subject = null;
    this.expression = null;
    this.description = null;

    this.set(options);
  }

  isValid() {
    return !!this.subject && !!this.expression;
  }
}

export class ResponseTime extends AssertionType {
  constructor(options) {
    super(ASSERTION_TYPE.RESPONSE_TIME);
    this.value = null;

    this.set(options);
  }

  isValid() {
    return !!this.value;
  }
}

/** ------------------------------------ **/
const JMX_ASSERTION_CONDITION = {
  MATCH: 1,
  CONTAINS: 1 << 1,
  NOT: 1 << 2,
  EQUALS: 1 << 3,
  SUBSTRING: 1 << 4,
  OR: 1 << 5
}

class JMXRequest {
  constructor(request) {
    if (request && request instanceof Request && request.url) {
      let url = new URL(request.url);
      this.method = request.method;
      this.hostname = url.hostname;
      this.pathname = url.pathname;
      this.port = url.port;
      this.protocol = url.protocol.split(":")[0];
      if (this.method.toUpperCase() !== "GET") {
        this.pathname += url.search.replace('&', '&amp;');
      }
    }
  }
}

class JMeterTestPlan extends Element {
  constructor() {
    super('jmeterTestPlan', {
      version: "1.2", properties: "5.0", jmeter: "5.2.1"
    });

    this.add(new HashTree());
  }

  put(te) {
    if (te instanceof TestElement) {
      this.elements[0].add(te);
    }
  }
}

class APIBackendListener extends DefaultTestElement {
  constructor() {
    super('BackendListener', 'BackendListenerGui', 'BackendListener', 'API Backend Listener');
    this.stringProp('classname', 'io.metersphere.api.jmeter.APIBackendListenerClient');
  }
}

class JMXGenerator {
  constructor(test) {
    if (!test || !(test instanceof Test)) return;

    let testPlan = new TestPlan(test.name);
    test.scenarioDefinition.forEach(scenario => {
      let threadGroup = new ThreadGroup(scenario.name);

      scenario.requests.forEach(request => {
        let httpSamplerProxy = new HTTPSamplerProxy(request.name, new JMXRequest(request));

        this.addRequestHeader(httpSamplerProxy, request);

        if (request.method.toUpperCase() === 'GET') {
          this.addRequestArguments(httpSamplerProxy, request);
        } else {
          this.addRequestBody(httpSamplerProxy, request);
        }

        this.addRequestAssertion(httpSamplerProxy, request);

        threadGroup.put(httpSamplerProxy);
      })

      threadGroup.put(new APIBackendListener());
      testPlan.put(threadGroup);
    })

    this.jmeterTestPlan = new JMeterTestPlan();
    this.jmeterTestPlan.put(testPlan);
  }

  addRequestHeader(httpSamplerProxy, request) {
    let name = request.name + " Headers";
    let headers = request.headers.filter(this.filter);
    if (headers.length > 0) {
      httpSamplerProxy.putRequestHeader(new HeaderManager(name, headers));
    }
  }

  addRequestArguments(httpSamplerProxy, request) {
    let args = request.parameters.filter(this.filter)
    if (args.length > 0) {
      httpSamplerProxy.addRequestArguments(new HTTPSamplerArguments(args));
    }
  }

  addRequestBody(httpSamplerProxy, request) {
    let body = [];
    if (request.body.isKV()) {
      body = request.body.kvs.filter(this.filter);
    } else {
      body.push({name: '', value: request.body.raw});
    }

    httpSamplerProxy.addRequestBody(new HTTPSamplerArguments(body));
  }

  addRequestAssertion(httpSamplerProxy, request) {
    let assertions = request.assertions;
    if (assertions.regex.length > 0) {
      assertions.regex.filter(this.filter).forEach(regex => {
        httpSamplerProxy.putResponseAssertion(this.getAssertion(regex));
      })
    }

    if (assertions.duration.isValid()) {
      httpSamplerProxy.putDurationAssertion(assertions.duration.type, assertions.duration.value);
    }
  }

  getAssertion(regex) {
    let name = regex.description;
    let type = JMX_ASSERTION_CONDITION.MATCH; // 固定用Match，自己写正则
    let value = regex.expression;
    switch (regex.subject) {
      case ASSERTION_REGEX_SUBJECT.RESPONSE_CODE:
        return new ResponseCodeAssertion(name, type, value);
      case ASSERTION_REGEX_SUBJECT.RESPONSE_DATA:
        return new ResponseDataAssertion(name, type, value);
      case ASSERTION_REGEX_SUBJECT.RESPONSE_HEADERS:
        return new ResponseHeadersAssertion(name, type, value);
    }
  }

  filter(config) {
    return config.isValid();
  }

  toXML() {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += this.jmeterTestPlan.toXML();
    return xml;
  }
}


