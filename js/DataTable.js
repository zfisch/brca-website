/*global module: false, require: false, URL: false, Blob: false */
'use strict';

var React = require('react');
var Rx = require('rx');
require('rx/dist/rx.time');
var {Table, Pagination} = require('react-data-components-bd2k');
var {Button, Row, Col} = require('react-bootstrap');
var VariantSearch = require('./VariantSearch');
var SelectField = require('./SelectField');
var ColumnCheckbox = require('./ColumnCheckbox');
var _ = require('underscore');
var cx = require('classnames');
var hgvs = require('./hgvs');
var PureRenderMixin = require('./PureRenderMixin'); // deep-equals version of PRM

var filterDisplay = v => v == null ? 'Any' : v;
var filterAny = v => v === 'Any' ? null : v;
var addAny = opts => ['Any', ...opts];

var pluralize = (n, s) => n === 1 ? s : s + 's';

var merge = (...args) => _.extend({}, ...args);


function setPages({data, count}, pageLength) {
	return {
		data,
		count,
		totalPages: Math.ceil(count / pageLength)
	};
}

// Wrap Table with a version having PureRenderMixin
var FastTable = React.createClass({
	mixins: [PureRenderMixin],
	render: function () {
		return <Table {...this.props}/>;
	}
});

// Merge new state (e.g. initialState) with existing state,
// deep-merging columnSelect.
function mergeState(state, newState) {
	var {columnSelect, ...otherProps} = newState,
		cs = {...state.columnSelect, ...columnSelect};
	return {...state, columnSelect: cs, ...otherProps};
}

var DataTable = React.createClass({
	mixins: [PureRenderMixin],
	componentWillMount: function () {
		var q = this.fetchq = new Rx.Subject();
		this.subs = q.map(this.props.fetch).debounce(100).switchLatest().subscribe(
			resp => this.setState(setPages(resp, this.state.pageLength)), // set data, count, totalPages
			() => this.setState({error: 'Problem connecting to server'}));
	},
	componentWillUnmount: function () {
		this.subs.dispose();
	},
	componentDidMount: function () {
		this.fetch(this.state);
	},
	getInitialState: function () {
		return mergeState({
			data: [],
			filtersOpen: false,
			filterValues: {},
			search: '',
			columnSelection: _.object(_.map(this.props.columns, c => [c.prop, true])),
			pageLength: 20,
			page: 0,
			totalPages: 20 // XXX this is imaginary. Do we need it?
		}, this.props.initialState);
	},
	componentWillReceiveProps: function(newProps) {
		var newState = mergeState(this.state, newProps.initialState);
		this.setState(newState);
		this.fetch(newState);
	},
	setFilters: function (obj) {
		var {filterValues} = this.state,
			newFilterValues = merge(filterValues, obj);

		this.setStateFetch({
		  filterValues: newFilterValues,
		  page: 0
		});
	},
	createDownload: function () {
		var {search, sortBy, filterValues, columnSelection} = this.state;
		return this.props.url(merge({
			format: 'tsv',
			pageLength: null,
			page: null,
			sortBy,
			search,
			searchColumn: _.keys(_.pick(columnSelection, v => v)),
			filterValues}, hgvs.filters(search, filterValues)));
	},
	fetch: function (state) {
		// XXX set source
		var {pageLength, search, page, sortBy,
			filterValues, columnSelection} = state;
		this.fetchq.onNext(merge({
			pageLength,
			page,
			sortBy,
			search,
			searchColumn: _.keys(_.pick(columnSelection, v => v)),
			filterValues}, hgvs.filters(search, filterValues)));
	},
	// helper function that sets state, fetches new data,
	// and updates url.
	setStateFetch: function (opts) {
		var newState = {...this.state, ...opts};
		this.setState(newState);
		this.fetch(newState);
		this.props.onChange(newState);
	},
	toggleFilters: function () {
		this.setState({filtersOpen: !this.state.filtersOpen});
	},
    toggleColumns: function (prop) {
		var {columnSelection} = this.state,
			val = columnSelection[prop],
			cs = {...columnSelection, [prop]: !val};

        this.setStateFetch({columnSelection: cs});
    },
	onChangePage: function (pageNumber) {
		this.setStateFetch({page: pageNumber});
	},
	onSort: function(sortBy) {
		this.setStateFetch({sortBy});
	},
	onPageLengthChange: function(txt) {
		var length = parseInt(txt),
			{page, pageLength} = this.state,
			newPage = Math.floor((page * pageLength) / length);

		this.setStateFetch({page: newPage, pageLength: length});
	},
	render: function () {
		var {filterValues, filtersOpen, search, data, columnSelection,
				page, totalPages, count, error} = this.state,
			{columns, filterColumns, suggestions, className} = this.props,
			renderColumns = _.filter(columns, c => columnSelection[c.prop]),
			filterFormEls = _.map(filterColumns, ({name, prop, values}) =>
				<SelectField onChange={v => this.setFilters({[prop]: filterAny(v)})}
					key={prop} label={`${name} is: `} value={filterDisplay(filterValues[prop])} options={addAny(values)}/>),
			filterFormCols = _.map(columns, ({title, prop}) =>
				<ColumnCheckbox onChange={() => this.toggleColumns(prop)} key={prop} label={prop} title={title} initialCheck={columnSelection}/>);

		return (error ? <p>{error}</p> :
			<div className={this.props.className}>
				<Row style={{marginBottom: '2px'}}>
					<Col sm={12}>
						<Button bsSize='xsmall' onClick={this.toggleFilters}>{(filtersOpen ? 'Hide' : 'Show' ) + ' Filters'}</Button>
						{filtersOpen && <div className='form-inline'>{filterFormEls}</div>}
                        {filtersOpen && <div className='form-inline'>
                                            <label className='control-label' style={{marginRight: '1em'}}>
                                                Column Selection
                                                {filterFormCols}
                                            </label>
                                        </div>}
					</Col>
				</Row>
				<Row style={{marginBottom: '2px'}}>
					<Col sm={6}>
						<div className='form-inline'>
							<div className='form-group'>
								<label className='control-label'
										style={{marginRight: '1em'}}>
									{count} matching {pluralize(count, 'variant')}
								</label>
								<Button download="variants.tsv" href={this.createDownload()}>Download</Button>
							</div>
						</div>
					</Col>
					<Col sm={3} smOffset={3}>
						<div className='form-inline pull-right-sm'>
							<SelectField
								label="Page size:"
								value={this.state.pageLength}
								options={this.props.pageLengthOptions}
								onChange={this.onPageLengthChange}
							/>
						</div>
					</Col>
				</Row>
				<Row style={{marginBottom: '2px'}}>
					<Col sm={5}>
						<VariantSearch
							id='variants-search'
							suggestions={suggestions}
							value={search}
							onChange={v => {
								this.setStateFetch({search: v});
							}}
						/>
					</Col>
					<Col sm={6} smOffset={1}>
						<Pagination
							className="pagination pull-right-sm"
							currentPage={page}
							totalPages={totalPages}
							onChangePage={this.onChangePage} />
					</Col>
				</Row>
				<Row>
					<Col className="table-responsive" sm={12}>
						<FastTable
							className={cx(className, "table table-hover table-bordered table-condensed")}
							dataArray={data}
							columns={renderColumns}
							keys={this.props.keys}
							buildRowOptions={this.props.buildRowOptions}
							buildHeader={this.props.buildHeader}
							sortBy={this.state.sortBy}
							onSort={this.onSort} />
					</Col>
				</Row>
			</div>
		);
	}
});

module.exports = DataTable;
