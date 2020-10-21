﻿import { DataRow, DataType, utils as dataUtils, EasyDataTable } from '@easydata/core';
import {
    EasyGrid, DefaultDialogService, browserUtils,
    domel, DomElementBuilder, GridColumn, GridCellRenderer, DialogService
} from '@easydata/ui';

import { EqContext, DataModel, Entity, EntityAttr, ValueEditor, EditorTag, HttpClient } from '@easyquery/core';
import { DefaultDateTimePicker } from '@easyquery/ui';

class EasyDataView {

    private activeEntity?: Entity;
    private grid?: EasyGrid;
    private resultTable?: EasyDataTable;

    private model: DataModel;

    private basePath: string;

    private dlg: DialogService;

    private http: HttpClient;

    private endpoint = '/api/easydata';

    constructor() {
        this.dlg = new DefaultDialogService();
        this.http = new HttpClient();
    
        this.basePath = this.getBasePath();

        this.model = new DataModel();
        this.resultTable = new EasyDataTable();

        this.http.get(`${this.endpoint}/models/EasyData`)
            .then(result => {
                if (result.model) {
                    this.model.loadFromData(result.model);
                }

                this.activeEntity = this.getActiveEntity();
                this.renderEntitySelector();
                if (this.activeEntity) {
                    this.renderGrid();
                }
            });
    }

    private getActiveEntity(): Entity | null {
        const decodedUrl = decodeURIComponent(window.location.href);
        const splitIndex = decodedUrl.lastIndexOf('/');
        const typeName = decodedUrl.substring(splitIndex + 1);

        return typeName && typeName.toLocaleLowerCase() !== 'easydata'
            ? this.model.getRootEntity().subEntities
                .filter(e => e.id == typeName)[0]
            : null;
    }

    private getBasePath(): string {
        const decodedUrl = decodeURIComponent(window.location.href);
        const easyDataIndex = decodedUrl.indexOf('easydata');
        return decodedUrl.substring(0, easyDataIndex + 'easydata'.length);
    }

    private renderEntitySelector() {
        const entities = this.model.getRootEntity().subEntities;
        const entityListSlot = document.getElementById('EntityList');
        if (entityListSlot) {
            const ul = document.createElement('ul');
            ul.className = 'list-group';
            entityListSlot.appendChild(ul);

            for(const entity of entities) {
                const li = document.createElement('li');
                li.className = 'list-group-item';
                if (entity === this.activeEntity) {
                    li.classList.add('active');
                }
                li.addEventListener('click', () => {
                    window.location.href = `${this.basePath}/${entity.id}`;
                });
                li.innerHTML = entity.caption;
                ul.appendChild(li);
            }
        }
    }

    private renderGrid() {
       
        const url = `${this.endpoint}/models/${this.model.getId()}/crud/${this.activeEntity.id}`;

        this.http.get(url)
            .then(result => {

                if (result.resultSet) {
                    this.resultTable.clear();
                    const resultSet = result.resultSet;
                    for (const col of resultSet.cols) {
                        this.resultTable.columns.add(col);
                    }

                    this.resultTable.setTotal(resultSet.rows.length);
                    for (const row of resultSet.rows) {
                        this.resultTable.addRow(row);
                    }

                }
            
                const gridSlot = document.getElementById('Grid');
                this.grid = new EasyGrid({
                    slot: gridSlot,
                    dataTable: this.resultTable,
                    paging: {
                        enabled: false,
                    },
                    addColumns: true,
                    onAddColumnClick: this.addClickHandler.bind(this),
                    onGetCellRenderer: this.manageCellRenderer.bind(this)
                });

                this.grid.refresh();
            });
    }

    private manageCellRenderer(column: GridColumn, defaultRenderer: GridCellRenderer) {
        if (column.isRowNum) {
            column.width = 100;
            return (value: any, column: GridColumn, cell: HTMLElement) => {
                domel('div', cell)
                    .addClass(`keg-cell-value`)
                    .addChild('a', b => b
                        .attr('href', 'javascript:void(0)')
                        .text('Edit')
                        .on('click', (ev) => this.editClickHandler(ev as MouseEvent, cell))
                    )
                    .addChild('span', b => b.text(' | '))
                    .addChild('a', b => b
                        .attr('href', 'javascript:void(0)')
                        .text('Delete')
                        .on('click', (ev) => this.deleteClickHandler(ev as MouseEvent, cell))
                    );
            }
        }
    }

    private addClickHandler() {
        const form = this.generateEditForm({ entity: this.activeEntity, editPK: true });
        this.dlg.open({
            title: `Create ${this.activeEntity.caption}`,
            body: form,
            onSubmit: () => {
                const obj: any = {};
                const inputs = Array.from(form.querySelectorAll('input'));
                for(const input of inputs) {
                    const property = input.name.substring(input.name.lastIndexOf('.') + 1);

                    const value = (input.type == 'date' || input.type == 'time')
                        ? input.valueAsDate
                        : (input.type == 'number')
                            ? input.valueAsNumber
                            : input.type == 'checkbox'
                                ? input.checked
                                : input.value;

                    obj[property] = value;
                }

                const url = `${this.endpoint}/models/${this.model.getId()}` +
                            `/crud/${this.activeEntity.id}`;
                
                this.http.post(url, obj, { dataType: 'json' })
                .then(() => {
                    window.location.reload();
                })
                .catch((error) => {
                    this.dlg.open({
                        title: 'Ooops, smth went wrong',
                        body: error.message,
                        closable: true,
                        cancelable: false
                    });
                });
            }
        });
    }

    private editClickHandler(ev: MouseEvent, cell: HTMLElement) {
        const rowEl = cell.parentElement;
        const index = Number.parseInt(rowEl.getAttribute('data-row-idx'));

        this.resultTable.getRow(index)
            .then(row => {
                if (row) {
                    const form = this.generateEditForm({ entity: this.activeEntity, values: row });
                    this.dlg.open({
                        title: `Edit ${this.activeEntity.caption}`,
                        body: form,
                        onSubmit: () => {

                            const keyAttrs = this.activeEntity.attributes.filter(attr => attr.isPrimaryKey);
                            const keys = keyAttrs.map(attr => row.getValue(attr.id));
            
                            const obj: any = {};
                            const inputs = Array.from(form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select'));
                            for(const input of inputs) {
                                const property = input.name.substring(input.name.lastIndexOf('.') + 1);

                                const value = (input.type == 'date' || input.type == 'time')
                                        ? (input as HTMLInputElement).valueAsDate
                                    : (input.type == 'number')
                                        ? (input as HTMLInputElement).valueAsNumber
                                        : input.type == 'checkbox'
                                            ? (input as HTMLInputElement).checked
                                            : input.value;
            
                                obj[property] = value;
                            }
          
           
                            const url = `/api/easydata/models/${this.model.getId()}` +
                                        `/crud/${this.activeEntity.id}/${keys.join(':')}`;
                            
                            this.http.put(url, obj, { dataType: 'json' })
                            .then(() => {
                                window.location.reload();
                            })       
                            .catch((error) => {
                                this.dlg.open({
                                    title: 'Ooops, smth went wrong',
                                    body: error.message,
                                    closable: true,
                                    cancelable: false
                                });
                            });
                        }
                    })
                }
            })
    }

    private deleteClickHandler(ev: MouseEvent, cell: HTMLElement) {
        const rowEl = cell.parentElement;
        const index = Number.parseInt(rowEl.getAttribute('data-row-idx'));
        this.resultTable.getRow(index)
            .then(row => {
                if (row) {
                    const keyAttrs = this.activeEntity.attributes.filter(attr => attr.isPrimaryKey);
                    const keys = keyAttrs.map(attr => row.getValue(attr.id));
                    const entityId = keyAttrs.map((attr, index) => `${attr.id}:${keys[index]}`).join(';');
                    this.dlg.openConfirm(
                        `Delete ${this.activeEntity.caption}`, 
                        `Are you shure about removing this entity: [${entityId}]?`
                    )
                    .then((result) => {
                        if (result) {

                            const url = `${this.endpoint}/models/${this.model.getId()}` +
                                        `/crud/${this.activeEntity.id}/${keys.join(':')}`; //pass entityId in future
                            
                            this.http.delete(url).then(() => {
                                window.location.reload();
                            })
                            .catch((error) => {
                                this.dlg.open({
                                    title: 'Ooops, smth went wrong',
                                    body: error.message,
                                    closable: true,
                                    cancelable: false
                                });
                            });
                        }
                    })
                }
            });
    }

    private generateEditForm(params: { entity: Entity, values?: DataRow, editPK?: boolean }): HTMLDivElement {

        const isIE = browserUtils.IsIE();

        let fb: DomElementBuilder<HTMLDivElement>;
        const form =
         domel('div')
            .addClass('kfrm-form')
            .addChild('div', b => {
                b.addClass(`${isIE 
                    ? 'kfrm-fields-ie col-ie-1-4 label-align-right' 
                    : 'kfrm-fields col-a-1 label-align-right'}`);
 
                fb = b;
            })
            .toDOM();

        if (browserUtils.IsIE()) {
            fb = domel('div', fb.toDOM())
                .addClass('kfrm-field-ie');
        }

        const getInputType = (dataType: DataType): string => {
            if (dataType == DataType.Bool) {
                return 'checkbox';
            }
            if (dataUtils.isNumericType(dataType)) {
                return 'number';
            }
            if (dataType == DataType.Date 
                || dataType == DataType.DateTime) {
                return 'date';
            }
            if (dataType == DataType.Time) {
                return 'time';
            }

            return 'text';
        }

        const getEditor = (attr: EntityAttr): ValueEditor => {
            return attr.defaultEditor || new ValueEditor();
        }

        const addFormField = (parent: HTMLElement, attr: EntityAttr) => {
            const value = params.values 
                ? params.values.getValue(attr.id)
                : undefined;

            const editor = getEditor(attr);
            if (editor.tag == EditorTag.Unknown) {
                if ([DataType.Date, DataType.DateTime, DataType.Time].indexOf(attr.dataType) >= 0) {
                    editor.tag  = EditorTag.DateTime;
                }
                else {
                    editor.tag  = EditorTag.Edit;  
                }
            }

            domel(parent)
                .addChild('label', b => b
                    .attr('for', attr.id)
                    .addText(`${attr.caption}: `)
            );

            switch (editor.tag) {
                case EditorTag.DateTime:
                    domel(parent)
                     .addChild('input', b => { 

                        b.name(attr.id)
                        b.type(getInputType(attr.dataType));

                         b.value(value);

                         b.on('focus', (ev) => {
                             const inputEl = ev.target as HTMLInputElement;
                             const oldValue = inputEl.valueAsDate;
                             const pickerOptions = {
                                 showCalendar: attr.dataType !== DataType.Time,
                                 showTimePicker: attr.dataType !== DataType.Date,
                                 onApply: (dateTime: Date) => {
                                     inputEl.valueAsDate = dateTime;
                                 },
                                 onCancel: () => {
                                     inputEl.valueAsDate = oldValue;
                                 },
                                 onDateTimeChanged: (dateTime: Date) => {
                                     inputEl.valueAsDate = dateTime;
                                 }
                             };
                             const dtp = new DefaultDateTimePicker(pickerOptions);
                             dtp.setDateTime(oldValue);
                             dtp.show(inputEl);
                         });
                     });
                    break;

                case EditorTag.List:
                    domel(parent)
                        .addChild('select', b => {
                            b
                            .attr('name', attr.id)
                            
                            if (editor.values) {
                                for(let i = 0 ; i < editor.values.length; i++) {
                                    b.addOption({
                                        value: value.id,
                                        title: value.text,
                                        selected: i === 0
                                    });
                                }
                            }
                        });

                case EditorTag.Edit:
                    default:
                        domel(parent)
                            .addChild('input', b => {
                                b
                                    .name(attr.id)
                                    .type(getInputType(attr.dataType));
    
                                if (value) {
                                    if (attr.dataType == DataType.Bool)
                                        b.attr('checked', '');
                                    else
                                        b.value(value);
                                }
                            });
                        break;
            }
            
        }

        for(const attr of params.entity.attributes) {
            if (attr.isPrimaryKey && !params.editPK)
                continue;

            addFormField(fb.toDOM(), attr)
        }

        return form;
    }
}

window.addEventListener('load', () => {
    window['easydata'] = new EasyDataView();
});